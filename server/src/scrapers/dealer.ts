/**
 * Dealership scrapers, configured via src/config/dealers.json.
 *
 * Two platforms:
 *  - `convertus` — WordPress/Vue dealers (Wayne Toyota, Superior Hyundai) whose
 *    inventory is only reachable through the site's Convertus VMS JSON proxy.
 *    Scraped browser-free via makeConvertusScraper (needs a `cp` company id).
 *  - `html` (default) — generic three-strategy HTML scraper. These sites render
 *    client-side and/or sit behind bot challenges, so they usually only yield
 *    data with SCRAPE_JS_FALLBACK=1 and Chromium installed.
 */

import dealersConfig from "../config/dealers.json";
import { Scraper } from "./types";
import { makeScraper } from "./genericScraper";
import { makeConvertusScraper } from "./convertus";

interface DealerEntry {
  key: string;
  name: string;
  city: string;
  province: string;
  platform?: "convertus" | "html";
  cp?: number;
  urls?: string[];
}

/** Hosts for platform dealers that have no scrapeable `urls` in the config. */
const DOMAINS: Record<string, string> = {
  waynetoyota: "www.waynetoyota.com",
  superiorhyundai: "www.superiorhyundai.ca",
};

/** Derive the dealer's host from its first configured URL, else from the key. */
function dealerDomain(d: DealerEntry): string {
  if (d.urls?.[0]) return new URL(d.urls[0]).host;
  return DOMAINS[d.key] ?? "";
}

export const dealerScrapers: Scraper[] = (dealersConfig.dealers as DealerEntry[]).map((d) => {
  if (d.platform === "convertus" && d.cp != null) {
    return makeConvertusScraper({
      key: d.key,
      source: d.name,
      domain: dealerDomain(d),
      cp: d.cp,
      city: d.city,
      province: d.province,
    });
  }
  return makeScraper({
    key: d.key,
    source: d.name,
    urls: d.urls ?? [],
    meta: { dealer: d.name, city: d.city, province: d.province },
    jsFallback: true,
    bestEffort: true,
  });
});
