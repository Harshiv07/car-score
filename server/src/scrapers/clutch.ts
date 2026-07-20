/**
 * Clutch.ca — online used-car retailer, scraped through its public JSON API
 * (api.clutch.ca). Browser-free: it returns fully structured vehicles (year,
 * make, model, trim, mileage, drivetrain, fuel, province price), so it works on
 * hosts without Chromium (Render, etc.).
 *
 * Queried as ONE combined request listing all 5 makes + all 10 supported models
 * at once (`makes[]`×5, `models[]`×10), then paginated. The API returns every
 * page as a MIX of all requested models (e.g. page 0 already spans RAV4, CR-V,
 * CX-5, Elantra, Corolla, Civic…), so every model is represented on every run.
 * This replaced a per-model approach whose problem was the WAF: api.clutch.ca
 * sits behind AWS WAF that allows only ~4-6 requests per run before returning
 * an empty HTTP 202 challenge — and slowing the pacing doesn't help (verified:
 * 400ms vs 3000ms between requests made no difference; it's a request-COUNT
 * budget, not a rate limit). Per-model, that budget bought ~6 complete models
 * and left the other 4 with nothing; the combined query spends the same ~5
 * pages on a proportional slice of ALL 10 models instead (`totalCount` ≈ 778
 * across the supported models; ~5 pages × 32 ≈ 160 covering everything).
 *
 * When a real browser IS available (local dev with Chromium), a bonus tier
 * continues pagination from inside a WAF-cleared browser page to pull the
 * remaining pages the bare-fetch WAF budget couldn't. No-op on Render.
 */

import { Listing } from "../types";
import { matchModelFromTitle, VEHICLE_MODELS } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";
import { closeBrowserSession, fetchJsonInSession, openBrowserSession } from "./crawl";

const API = "https://api.clutch.ca/v1";
// A Clutch fulfilment location; determines which province price is attached.
// Overridable in case Clutch rotates ids.
const LOCATION_ID = process.env.CLUTCH_LOCATION_ID || "56f159d4-49db-4a61-b2d8-d8784f10a184";
const PROVINCE = "ON";
// Hard ceiling on browser-tier continuation (~778 / 32 ≈ 25 pages = everything).
const ABSOLUTE_MAX_PAGES = 30;

/** The supported models, derived from the knowledge base so this can never
 *  drift out of sync with what we score. Exported for the query builder + test. */
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
  // Deep-link to the exact vehicle detail page (e.g. clutch.ca/vehicles/111414).
  const url = v.id != null ? `https://www.clutch.ca/vehicles/${v.id}` : "https://www.clutch.ca/cars";
  return {
    title: [year, make, model, trim].filter(Boolean).join(" "),
    make,
    model,
    trim: trim || null,
    year,
    price: priceOf(v),
    km: typeof v.mileage === "number" ? v.mileage : null,
    drivetrain: drive || null,
    fuel: fuel || null,
    url,
    image: v.cardPhotoUrl ?? null,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The API sits behind AWS WAF, which hands out an `aws-waf-token` cookie on the
 * first hit. We keep the cookie so later requests in the same run are trusted.
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
 * Build the combined all-models Clutch API query for one page. Every supported
 * make + model is listed so a single paginated query returns a mix of all of
 * them. Exported for a regression test. The non-page params mirror exactly what
 * the real clutch.ca frontend sends — nothing extra, since a request shape no
 * real browser produces is exactly what WAF/bot detection flags.
 */
export function buildAllModelsQueryUrl(page: number): string {
  const makes = [...new Set(MODEL_TARGETS.map((t) => t.make))];
  const models = MODEL_TARGETS.map((t) => t.model);
  const p = new URLSearchParams();
  for (const mk of makes) p.append("makes[]", mk);
  for (const md of models) p.append("models[]", md);
  p.set("downPayment", "0");
  p.set("isBiweekly", "true");
  p.set("interestRate", "7.99");
  p.set("page", String(page));
  return `${API}/vehicles/locations/${LOCATION_ID}?${p.toString()}`;
}

async function fetchPage(page: number, timeoutMs: number): Promise<ClutchPage | null> {
  const res = await fetchWithTimeout(buildAllModelsQueryUrl(page), {
    headers: {
      ...BROWSER_HEADERS,
      Origin: "https://www.clutch.ca",
      Referer: "https://www.clutch.ca/",
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    timeoutMs,
  });
  rememberCookies(res);
  const text = await res.text();
  return res.ok && text.trim().startsWith("{") ? (JSON.parse(text) as ClutchPage) : null;
}

/** Normalize + dedupe a page's vehicles into `listings`. Returns how many were
 *  added. `matchModelFromTitle` keeps only the models we score (drops the
 *  "Corolla Cross"/"Civic Sedan"-style near-matches the combined query pulls in,
 *  keeps "RAV4 Hybrid" → RAV4). */
function ingestVehicles(vehicles: ClutchVehicle[], listings: Listing[], seen: Set<string>): number {
  let added = 0;
  for (const v of vehicles) {
    if (v.visibleOnSite === false) continue;
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
      added++;
    }
  }
  return added;
}

/**
 * Bonus tier: once the bare-fetch WAF budget is spent, continue paginating from
 * inside a real, WAF-cleared browser page (the in-page fetch inherits the
 * browser's solved challenge). Pulls pages `[startPage, totalPages)` up to a
 * hard cap / deadline. No-ops if no browser is available (Render) or if the
 * browser is itself blocked. Verified to be a genuine bonus only where a
 * browser + unflagged IP exist (local dev); harmless everywhere else.
 */
async function continueViaBrowser(
  startPage: number,
  totalPages: number,
  listings: Listing[],
  seen: Set<string>,
  deadline: number,
  log: LogFn
): Promise<number> {
  const lastPage = Math.min(totalPages, ABSOLUTE_MAX_PAGES);
  if (startPage >= lastPage || Date.now() >= deadline) return 0;
  const session = await openBrowserSession("https://www.clutch.ca/cars", log);
  if (!session) return 0; // no browser on this host — graceful no-op

  let added = 0;
  try {
    log("info", `Clutch.ca: continuing pagination via a real browser session (page ${startPage}+)…`);
    for (let page = startPage; page < lastPage && Date.now() < deadline; page++) {
      const text = await fetchJsonInSession(session, buildAllModelsQueryUrl(page));
      if (!text) break; // browser is blocked too — stop
      try {
        const data = JSON.parse(text) as ClutchPage;
        added += ingestVehicles(data.vehicles ?? [], listings, seen);
      } catch {
        break;
      }
      await delay(400);
    }
  } finally {
    await closeBrowserSession(session);
  }
  return added;
}

export const clutch: Scraper = {
  key: "clutch",
  source: "Clutch.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    const maxPages = Math.max(1, cfg.clutchMaxPages);
    const deadline = Date.now() + cfg.sourceTimeoutMs - 5000;
    const listings: Listing[] = [];
    const seen = new Set<string>();

    log("info", `Clutch.ca: querying all ${MODEL_TARGETS.length} models in one combined request…`);

    // Bare-fetch pagination until the WAF challenges (a null page after page 0),
    // the page cap, the last real page, or the deadline.
    let page = 0;
    let totalPages = 1;
    let blockedMidway = false;
    for (; page < maxPages && Date.now() < deadline; page++) {
      let data: ClutchPage | null;
      try {
        data = await fetchPage(page, cfg.requestTimeoutMs);
      } catch (e) {
        log("warn", `Clutch.ca: page ${page} failed — ${(e as Error).message.slice(0, 80)}`);
        data = null;
      }
      if (!data) {
        blockedMidway = page > 0; // page 0 failing = unreachable, not "budget spent"
        break;
      }
      totalPages = data.totalPages ?? totalPages;
      ingestVehicles(data.vehicles ?? [], listings, seen);
      if (page + 1 >= totalPages) {
        page += 1; // consumed the last real page
        break;
      }
      await delay(400);
    }

    // If more pages exist than the WAF let us fetch, try to finish via a browser.
    if ((blockedMidway || page >= maxPages) && page < totalPages && cfg.jsFallbackEnabled) {
      await continueViaBrowser(page, totalPages, listings, seen, deadline, log);
    }

    const models = new Set(listings.map((l) => `${l.make} ${l.model}`));
    const ok = listings.length > 0;
    const note = listings.length
      ? `${listings.length} listing(s) across ${models.size}/${MODEL_TARGETS.length} models`
      : "Clutch API unreachable — skipped";
    log(ok ? "info" : "warn", `Clutch.ca: ${note}`);
    return { key: "clutch", source: "Clutch.ca", listings, ok, note };
  },
};
