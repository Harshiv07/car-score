/**
 * Clutch.ca — online used-car retailer, scraped through its public JSON API
 * (api.clutch.ca). This is a browser-free source: it returns fully structured
 * vehicles (year, make, model, trim, mileage, drivetrain, fuel, province
 * price), so it works on hosts without Chromium (Render, etc.) and yields
 * accurate data rather than empty shells. The old static-HTML approach fetched
 * a client-rendered page and always found nothing.
 *
 * Queried **per model** (matches clutch.ca/cars/{make}-{model} search pages),
 * not per make: a make-level query only pulls the first few pages of that
 * make's whole inventory, and a make with many models (Mazda: CX-30, CX-50,
 * CX-70, CX-90, Mazda3, MX-5, Mazda6, CX-5, …) can push a specific model we
 * score (CX-5, Mazda3) past that window entirely, silently starving it of
 * data. Querying `makes[]=Mazda&models[]=CX-5` goes straight to just that
 * model's inventory instead.
 */

import { Listing } from "../types";
import { matchModelFromTitle, VEHICLE_MODELS } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";

const API = "https://api.clutch.ca/v1";
// A Clutch fulfilment location; determines which province price is attached.
// Overridable in case Clutch rotates ids.
const LOCATION_ID = process.env.CLUTCH_LOCATION_ID || "56f159d4-49db-4a61-b2d8-d8784f10a184";
const PROVINCE = "ON";

/** One (make, model) query per model we score — derived from the knowledge
 *  base so this list can never drift out of sync with what we support.
 *  Exported so a test can assert every supported model gets its own query. */
export const MODEL_TARGETS: { make: string; model: string }[] = VEHICLE_MODELS.map((m) => ({
  make: m.make,
  model: m.model,
}));

interface ClutchNamed {
  name?: string | null;
}
interface ClutchPrice {
  price?: number | null;
  promoPrice?: number | null;
}
interface ClutchVehicle {
  id?: number;
  year?: number;
  mileage?: number;
  make?: ClutchNamed;
  model?: ClutchNamed;
  trim?: ClutchNamed;
  drivetrain?: ClutchNamed;
  fuelType?: ClutchNamed;
  cardPhotoUrl?: string | null;
  vehiclePrices?: ClutchPrice[];
  visibleOnSite?: boolean;
  ["vehiclePrice-ON"]?: ClutchPrice;
}
interface ClutchPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  vehicles: ClutchVehicle[];
}

function priceOf(v: ClutchVehicle): number | null {
  const p = v["vehiclePrice-ON"]?.price ?? v.vehiclePrices?.[0]?.price ?? null;
  return typeof p === "number" ? p : null;
}

/** Map a Clutch API vehicle to the raw shape the shared normalizer understands. */
export function clutchToRaw(v: ClutchVehicle): RawVehicleRecord {
  const make = v.make?.name ?? "";
  const model = v.model?.name ?? "";
  const trim = v.trim?.name ?? "";
  const drive = v.drivetrain?.name ?? "";
  const fuel = v.fuelType?.name ?? "";
  const year = v.year ?? "";
  // Deep-link to the exact vehicle detail page (e.g. clutch.ca/vehicles/111414)
  // rather than a generic model search.
  const url = v.id != null ? `https://www.clutch.ca/vehicles/${v.id}` : "https://www.clutch.ca/cars";
  return {
    // Put drivetrain + fuel in the title text so the normalizer's inference
    // (AWD / Hybrid) picks them up.
    title: [year, make, model, trim, drive, fuel].filter(Boolean).join(" "),
    make,
    model,
    trim: trim || null,
    year,
    price: priceOf(v),
    km: typeof v.mileage === "number" ? v.mileage : null,
    drivetrain: drive || null,
    url,
    image: v.cardPhotoUrl ?? null,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The API sits behind AWS WAF, which hands out an `aws-waf-token` cookie on the
 * first hit and rate-limits rapid sequential requests (a burst gets HTTP 202
 * with an empty body — a challenge, not real "no results"). We keep the cookie
 * (so later requests are trusted) and retry with backoff when that happens.
 */
let cookieJar = "";

function rememberCookies(res: Response): void {
  const setCookies =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const pairs = setCookies.map((c) => c.split(";")[0]).filter(Boolean);
  if (pairs.length) cookieJar = pairs.join("; ");
}

/**
 * Build the model-scoped Clutch API query (exported for a regression test —
 * `models[]` is the parameter that fixes make-level pagination cutting off
 * low-volume models like Mazda CX-5/Mazda3).
 *
 * Deliberately mirrors exactly what the real clutch.ca frontend sends (no
 * extra params like a custom page-size): a captured browser request for this
 * same endpoint was `?makes[]=Toyota&models[]=Rav4&downPayment=0&isBiweekly=
 * true&interestRate=7.99&page=0` — nothing else. An earlier version added
 * `&pc=50` to request bigger pages; Clutch silently ignored it (page size
 * stayed the API's default), so it did nothing useful, but a request shape no
 * real browser session ever produces is exactly the kind of signal WAF/bot
 * detection looks for — and this scraper started getting blocked after every
 * 1-2 requests once that param was added. Removed.
 */
export function buildModelQueryUrl(make: string, model: string, page: number): string {
  return (
    `${API}/vehicles/locations/${LOCATION_ID}` +
    `?makes[]=${encodeURIComponent(make)}&models[]=${encodeURIComponent(model)}` +
    `&downPayment=0&isBiweekly=true&interestRate=7.99&page=${page}`
  );
}

async function fetchModelPage(
  make: string,
  model: string,
  page: number,
  timeoutMs: number
): Promise<ClutchPage | null> {
  const url = buildModelQueryUrl(make, model, page);
  const doFetch = () =>
    fetchWithTimeout(url, {
      headers: {
        ...BROWSER_HEADERS,
        Origin: "https://www.clutch.ca",
        Referer: "https://www.clutch.ca/",
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
      timeoutMs,
    });

  // Two tries, not three: once the WAF starts challenging a request, hammering
  // it with a third retry rarely helps and just adds more suspicious traffic.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await doFetch();
    rememberCookies(res);
    const text = await res.text();
    if (res.ok && text.trim().startsWith("{")) {
      return JSON.parse(text) as ClutchPage;
    }
    if (attempt === 0) await delay(900);
  }
  return null;
}

export const clutch: Scraper = {
  key: "clutch",
  source: "Clutch.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    // Capped at 2 regardless of SCRAPE_MAX_PAGES: this scraper already makes
    // one request per supported model (10), so paginating deep on top of that
    // multiplies total request volume fast — and volume is exactly what trips
    // Clutch's WAF. Most supported models fit in 1-2 pages anyway (CX-5 ~54,
    // Mazda3 ~39 at the API's own page size); higher-volume models just get a
    // partial-but-real sample instead of the fuller set, which is a fine
    // trade against reliably getting *some* data for every model.
    const pagesPerModel = Math.max(1, Math.min(cfg.maxPagesPerSource, 2));
    const listings: Listing[] = [];
    const seen = new Set<string>();
    const failedModels: string[] = [];

    log("info", `Clutch.ca: querying API for ${MODEL_TARGETS.length} model(s) (≤${pagesPerModel} page(s) each)…`);

    // Every model gets its own independent attempt — a block/failure on one
    // model must never cost the others their turn. A prior version stopped
    // the whole run after 2 consecutive model failures to avoid deepening a
    // WAF block, but that traded a real bug (a transient block on 2 models
    // silently zeroed out every model queried *after* them, even though
    // nothing was actually wrong with them) for a hypothetical one. Failures
    // are logged (see `note` below) but never stop the loop.
    for (const { make, model } of MODEL_TARGETS) {
      let modelFound = 0;
      let modelReachable = false;
      for (let page = 0; page < pagesPerModel; page++) {
        let data: ClutchPage | null;
        try {
          data = await fetchModelPage(make, model, page, cfg.requestTimeoutMs);
        } catch (e) {
          log("warn", `Clutch.ca: ${make} ${model} page ${page} failed — ${(e as Error).message.slice(0, 80)}`);
          break;
        }
        if (!data) {
          if (page === 0) failedModels.push(`${make} ${model}`);
          break;
        }
        modelReachable = true;
        if (!Array.isArray(data.vehicles) || data.vehicles.length === 0) break;

        for (const v of data.vehicles) {
          if (v.visibleOnSite === false) continue;
          // Safety net: a model query can still include closely-related trims
          // (e.g. "RAV4 Hybrid" for a RAV4 query) — matchModelFromTitle keeps
          // only what we actually score.
          if (!matchModelFromTitle(`${v.make?.name ?? ""} ${v.model?.name ?? ""}`)) continue;
          const listing = normalizeRecord(clutchToRaw(v), {
            sourceWebsite: "Clutch.ca",
            baseUrl: "https://www.clutch.ca",
            dealer: "Clutch",
            province: PROVINCE,
          });
          if (listing && !seen.has(listing.dedupeKey)) {
            seen.add(listing.dedupeKey);
            listings.push(listing);
            modelFound++;
          }
        }
        if (page + 1 >= data.totalPages) break;
        await delay(600); // gentle pacing to stay under the WAF rate limit
      }

      if (modelFound === 0 && modelReachable) {
        log("warn", `Clutch.ca: ${make} ${model} — 0 listings (may be temporarily out of stock)`);
      }
      await delay(600); // same pacing whether this model succeeded or not
    }

    const ok = listings.length > 0 || failedModels.length < MODEL_TARGETS.length;
    const note =
      listings.length > 0
        ? `${listings.length} supported-model listing(s) found` +
          (failedModels.length ? ` (${failedModels.join(", ")} unreachable)` : "")
        : failedModels.length === MODEL_TARGETS.length
          ? "Clutch API unreachable — skipped"
          : "no supported-model listings in Clutch inventory right now";
    log(listings.length > 0 ? "info" : "warn", `Clutch.ca: ${note}`);
    return { key: "clutch", source: "Clutch.ca", listings, ok, note };
  },
};
