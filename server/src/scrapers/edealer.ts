/**
 * eDealer-platform dealers (e.g. Half-Way Motors Mazda) — a widely used
 * Canadian dealer website builder (static.edealer.ca / v3inventory.edealer.ca).
 *
 * The used-inventory page embeds the FULL inventory as a plain JS object
 * literal (`var vehicleArray = {...}`) directly in the server-rendered HTML —
 * no client-side rendering needed, so this is fully browser-free. Each entry
 * is already fully structured: VIN, year/make/model/trim, drivetrain, fuel,
 * mileage, price, colours, a VDP url and images.
 *
 * These sites commonly serve a shared multi-brand feed (a dealer group's used
 * lot mixes trade-ins of every make, sometimes across sibling stores under one
 * inventory page) — each vehicle carries its OWN `dealerName`, which is used
 * per-listing instead of the configured dealer's name, so a unit actually
 * being sold by a sibling store is attributed correctly.
 */

import { Listing } from "../types";
import { matchModelFromTitle } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";

export interface EdealerDealer {
  key: string;
  source: string; // display name (used as sourceWebsite / fallback dealer)
  url: string; // the used-inventory page, e.g. https://example.com/used/
  city?: string;
  province?: string;
}

interface EdealerImage {
  dirWs?: string;
  fileName?: string;
}
interface EdealerVehicle {
  vehicleId?: string;
  dealerName?: string | null;
  sellerName?: string | null;
  vin?: string | null;
  year?: string | number;
  make?: string;
  model?: string;
  trim?: string | null;
  driveTrain?: string | null;
  engine?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  exteriorColour?: string | null;
  interiorColour?: string | null;
  mileage?: string | number | null;
  price?: number | null;
  detailUrl?: string | null;
  images?: { images?: Record<string, EdealerImage> };
}

/** Find the index of the closing brace matching the '{' at `start` (string-aware). */
function matchBrace(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Pull the `vehicleArray` object literal out of an eDealer page and parse it. */
export function extractVehicleArray(html: string): EdealerVehicle[] {
  const marker = "vehicleArray = {";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return [];
  const start = markerIdx + marker.length - 1; // index of the '{'
  const end = matchBrace(html, start);
  if (end === -1) return [];
  try {
    const obj = JSON.parse(html.slice(start, end + 1)) as Record<string, EdealerVehicle>;
    return Object.values(obj);
  } catch {
    return [];
  }
}

function firstImageUrl(v: EdealerVehicle): string | null {
  const images = v.images?.images;
  if (!images) return null;
  const first = Object.values(images)[0];
  return first?.dirWs && first?.fileName ? `${first.dirWs}${first.fileName}` : null;
}

/** Map one eDealer vehicle to the shared raw shape the normalizer understands. */
export function edealerToRaw(v: EdealerVehicle): RawVehicleRecord {
  const make = v.make ?? "";
  const model = v.model ?? "";
  const trim = v.trim ?? "";
  const drive = v.driveTrain ?? "";
  const fuel = v.fuelType ?? "";
  return {
    // fuel/drivetrain text ride along in the title so normalize's inference
    // (AWD / Hybrid / etc.) picks them up — mirrors clutchToRaw's approach.
    title: [v.year, make, model, trim, drive, fuel].filter(Boolean).join(" "),
    make,
    model,
    trim: trim || null,
    year: v.year ?? "",
    price: typeof v.price === "number" ? v.price : null,
    // mileage arrives as a bare digit string ("31507"), not "31,507 km" — hand
    // parseKm a real number so its numeric fast-path applies directly.
    km: v.mileage != null ? Number(v.mileage) : null,
    drivetrain: drive || null,
    engine: v.engine ?? null,
    transmission: v.transmission ?? null,
    exteriorColour: v.exteriorColour ?? null,
    interiorColour: v.interiorColour ?? null,
    vin: v.vin ?? null,
    url: v.detailUrl ?? null,
    image: firstImageUrl(v),
  };
}

export function makeEdealerScraper(dealer: EdealerDealer): Scraper {
  return {
    key: dealer.key,
    source: dealer.source,
    async run(log: LogFn): Promise<ScraperRunResult> {
      const cfg = loadScrapeConfig();
      const listings: Listing[] = [];
      const seen = new Set<string>();
      const baseUrl = new URL(dealer.url).origin;

      log("info", `${dealer.source}: reading eDealer inventory…`);
      let html: string;
      try {
        const res = await fetchWithTimeout(dealer.url, { headers: BROWSER_HEADERS, timeoutMs: cfg.requestTimeoutMs });
        html = res.ok ? await res.text() : "";
      } catch (e) {
        log("warn", `${dealer.source}: fetch failed — ${(e as Error).message.slice(0, 100)}`);
        return { key: dealer.key, source: dealer.source, listings: [], ok: false, note: "inventory page unreachable" };
      }

      const vehicles = extractVehicleArray(html);
      if (vehicles.length === 0) {
        const note = html ? "no inventory data found on the page (site may have changed)" : "inventory page unreachable";
        log("warn", `${dealer.source}: ${note}`);
        return { key: dealer.key, source: dealer.source, listings: [], ok: !!html, note };
      }

      for (const v of vehicles) {
        if (!matchModelFromTitle(`${v.make ?? ""} ${v.model ?? ""}`)) continue;
        const listing = normalizeRecord(edealerToRaw(v), {
          sourceWebsite: dealer.source,
          baseUrl,
          // Multi-brand shared feeds: attribute to the vehicle's OWN selling
          // dealer, not the configured one, when they differ.
          dealer: v.dealerName || v.sellerName || dealer.source,
          city: dealer.city ?? null,
          province: dealer.province ?? null,
        });
        if (listing && !seen.has(listing.dedupeKey)) {
          seen.add(listing.dedupeKey);
          listings.push(listing);
        }
      }

      const ok = true; // a reachable page with a parseable feed is a successful run either way
      const note =
        listings.length > 0
          ? `${listings.length} supported-model listing(s) found`
          : `no supported-model listings among ${vehicles.length} in current inventory`;
      log(listings.length > 0 ? "info" : "warn", `${dealer.source}: ${note}`);
      return { key: dealer.key, source: dealer.source, listings, ok, note };
    },
  };
}
