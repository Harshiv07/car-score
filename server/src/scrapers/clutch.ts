/**
 * Clutch.ca — online used-car retailer, scraped through its public JSON API
 * (api.clutch.ca). This is a browser-free source: it returns fully structured
 * vehicles (year, make, model, trim, mileage, drivetrain, fuel, province
 * price), so it works on hosts without Chromium (Render, etc.) and yields
 * accurate data rather than empty shells. The old static-HTML approach fetched
 * a client-rendered page and always found nothing.
 */

import { Listing } from "../types";
import { finalizeListing } from "../util/listingKeys";
import { matchModelFromTitle } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";

const API = "https://api.clutch.ca/v1";
// A Clutch fulfilment location; determines which province price is attached.
// Overridable in case Clutch rotates ids.
const LOCATION_ID = process.env.CLUTCH_LOCATION_ID || "56f159d4-49db-4a61-b2d8-d8784f10a184";
const PROVINCE = "ON";
// Makes we score — one query per make, then normalize keeps supported models.
const MAKES = ["Toyota", "Honda", "Mazda", "Hyundai", "Subaru"];

interface ClutchNamed {
  name?: string | null;
}
interface ClutchPrice {
  price?: number | null;
  promoPrice?: number | null;
}
interface ClutchVehicle {
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

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
  const url =
    make && model && year
      ? `https://www.clutch.ca/cars/${year}-${slug(make)}-${slug(model)}`
      : "https://www.clutch.ca/cars";
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
 * first hit and rate-limits rapid sequential requests. We keep the cookie (so
 * later requests are trusted) and retry once with a short backoff when a
 * response comes back empty or non-OK.
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

async function fetchMakePage(make: string, page: number, timeoutMs: number): Promise<ClutchPage | null> {
  const url =
    `${API}/vehicles/locations/${LOCATION_ID}` +
    `?makes[]=${encodeURIComponent(make)}&downPayment=0&isBiweekly=true&interestRate=7.99&page=${page}`;
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

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await doFetch();
    rememberCookies(res);
    const text = await res.text();
    if (res.ok && text.trim().startsWith("{")) {
      return JSON.parse(text) as ClutchPage;
    }
    if (attempt === 0) await delay(700); // WAF cooldown, then retry once
  }
  return null;
}

export const clutch: Scraper = {
  key: "clutch",
  source: "Clutch.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    const pagesPerMake = Math.max(1, Math.min(cfg.maxPagesPerSource, 3));
    const listings: Listing[] = [];
    const seen = new Set<string>();
    let anyError = false;

    log("info", `Clutch.ca: querying API for ${MAKES.length} makes (≤${pagesPerMake} page(s) each)…`);

    for (const make of MAKES) {
      for (let page = 0; page < pagesPerMake; page++) {
        let data: ClutchPage | null;
        try {
          data = await fetchMakePage(make, page, cfg.requestTimeoutMs);
        } catch (e) {
          anyError = true;
          log("warn", `Clutch.ca: ${make} page ${page} failed — ${(e as Error).message.slice(0, 80)}`);
          break;
        }
        if (!data || !Array.isArray(data.vehicles) || data.vehicles.length === 0) break;

        for (const v of data.vehicles) {
          if (v.visibleOnSite === false) continue;
          // Cheap pre-filter so we skip normalizing makes/models we don't score.
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
          }
        }
        if (page + 1 >= data.totalPages) break;
        await delay(250); // gentle pacing to stay under the WAF rate limit
      }
      await delay(250);
    }

    const ok = listings.length > 0 || !anyError;
    const note =
      listings.length > 0
        ? `${listings.length} supported-model listing(s) found`
        : anyError
          ? "Clutch API unreachable — skipped"
          : "no supported-model listings in Clutch inventory right now";
    log(listings.length > 0 ? "info" : "warn", `Clutch.ca: ${note}`);
    return { key: "clutch", source: "Clutch.ca", listings, ok, note };
  },
};
