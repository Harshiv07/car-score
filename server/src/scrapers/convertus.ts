/**
 * Convertus VMS dealers (Wayne Toyota, Superior Hyundai, …).
 *
 * These are WordPress + Vue sites that render inventory client-side, so a
 * static crawl finds nothing. But the theme ships a same-origin PHP proxy
 * (`/wp-content/plugins/convertus-vms/include/php/ajax-vehicles.php`) that
 * fetches the Convertus VMS API server-side and returns fully-structured JSON —
 * so we can scrape it browser-free (works on hosts without Chromium). The
 * upstream `vms.prod.convertus.rocks` API 403s a direct hit; going through the
 * dealer's own proxy is what works.
 */

import { Listing } from "../types";
import { matchModelFromTitle } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";

export interface ConvertusDealer {
  key: string;
  source: string; // display name
  domain: string; // e.g. "www.waynetoyota.com"
  cp: number; // Convertus company id
  city?: string;
  province?: string;
}

interface ConvertusVehicle {
  vin?: string | null;
  year?: number;
  make?: string;
  model?: string;
  trim?: string | null;
  search_trim?: string | null;
  drive_train?: string | null;
  engine?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  exterior_color?: string | null;
  odometer?: number | null;
  initial_price?: number | null;
  final_price?: number | null;
  vdp_url?: string | null;
  image?: { image_original?: string | null } | string | null;
}

function imageUrl(v: ConvertusVehicle): string | null {
  if (!v.image) return null;
  if (typeof v.image === "string") return v.image;
  return v.image.image_original ?? null;
}

/** Map a Convertus VMS vehicle to the shared raw shape the normalizer understands. */
export function convertusToRaw(v: ConvertusVehicle): RawVehicleRecord {
  const make = v.make ?? "";
  const model = v.model ?? "";
  const trim = v.search_trim || v.trim || "";
  const drive = v.drive_train ?? "";
  const fuel = v.fuel_type ?? "";
  const price = v.final_price || v.initial_price || null;
  // vdp_url sometimes contains a `//` after the origin — harmless but tidy it.
  const url = v.vdp_url ? v.vdp_url.replace(/([^:])\/\//g, "$1/") : null;
  return {
    title: [v.year, make, model, trim, drive, fuel].filter(Boolean).join(" "),
    make,
    model,
    trim: trim || null,
    year: v.year ?? "",
    price,
    km: typeof v.odometer === "number" ? v.odometer : null,
    drivetrain: drive || null,
    engine: v.engine ?? null,
    transmission: v.transmission ?? null,
    exteriorColour: v.exterior_color ?? null,
    vin: v.vin ?? null,
    url,
    image: imageUrl(v),
  };
}

/** Same-origin proxy URL for one page of a dealer's used inventory. */
function proxyUrl(domain: string, cp: number, page: number, pageSize: number): string {
  const endpoint =
    `https://vms.prod.convertus.rocks/api/filtering/?cp=${cp}&ln=en&pg=${page}&pc=${pageSize}` +
    `&sc=used&in_stock=true`;
  return (
    `https://${domain}/wp-content/plugins/convertus-vms/include/php/ajax-vehicles.php` +
    `?endpoint=${encodeURIComponent(endpoint)}&action=vms_data`
  );
}

interface ConvertusPage {
  results?: ConvertusVehicle[];
  summary?: { total_vehicles?: number };
}

async function fetchPage(
  dealer: ConvertusDealer,
  page: number,
  pageSize: number,
  timeoutMs: number
): Promise<ConvertusPage | null> {
  const res = await fetchWithTimeout(proxyUrl(dealer.domain, dealer.cp, page, pageSize), {
    headers: { ...BROWSER_HEADERS, Referer: `https://${dealer.domain}/vehicles/used/` },
    timeoutMs,
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text.trim().startsWith("{")) return null; // e.g. a bot-challenge HTML page
  return JSON.parse(text) as ConvertusPage;
}

export function makeConvertusScraper(dealer: ConvertusDealer): Scraper {
  return {
    key: dealer.key,
    source: dealer.source,
    async run(log: LogFn): Promise<ScraperRunResult> {
      const cfg = loadScrapeConfig();
      const pageSize = 100;
      const maxPages = Math.max(1, cfg.maxPagesPerSource);
      const listings: Listing[] = [];
      const seen = new Set<string>();
      let anyError = false;
      let fetched = 0;

      // Query the whole used lot (not just the house brand) — dealers carry
      // trade-ins of every make, and normalize keeps only the models we score.
      log("info", `${dealer.source}: querying Convertus API…`);
      for (let page = 1; page <= maxPages; page++) {
        let data: ConvertusPage | null;
        try {
          data = await fetchPage(dealer, page, pageSize, cfg.requestTimeoutMs);
        } catch (e) {
          anyError = true;
          log("warn", `${dealer.source}: page ${page} failed — ${(e as Error).message.slice(0, 80)}`);
          break;
        }
        const vehicles = data?.results ?? [];
        if (vehicles.length === 0) break;
        fetched += vehicles.length;

        for (const v of vehicles) {
          if (!matchModelFromTitle(`${v.make ?? ""} ${v.model ?? ""}`)) continue;
          const listing = normalizeRecord(convertusToRaw(v), {
            sourceWebsite: dealer.source,
            baseUrl: `https://${dealer.domain}`,
            dealer: dealer.source,
            city: dealer.city ?? null,
            province: dealer.province ?? null,
          });
          if (listing && !seen.has(listing.dedupeKey)) {
            seen.add(listing.dedupeKey);
            listings.push(listing);
          }
        }
        if (fetched >= (data?.summary?.total_vehicles ?? fetched)) break;
        await new Promise((r) => setImmediate(r));
      }

      const ok = listings.length > 0 || (!anyError && fetched > 0);
      const note =
        listings.length > 0
          ? `${listings.length} supported-model listing(s) found`
          : anyError
            ? "Convertus proxy unreachable — skipped"
            : "no supported-model listings in current inventory";
      log(listings.length > 0 ? "info" : "warn", `${dealer.source}: ${note}`);
      return { key: dealer.key, source: dealer.source, listings, ok, note };
    },
  };
}
