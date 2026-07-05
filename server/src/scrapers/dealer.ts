/**
 * Dealership scrapers, configured via src/config/dealers.json.
 *
 * Platforms:
 *  - `convertus` — WordPress/Vue dealers (Wayne Toyota, Superior Hyundai) whose
 *    inventory is reached through the site's Convertus VMS JSON proxy (needs a
 *    `cp` company id). Browser-free.
 *  - `stm` — WordPress "Motors" theme dealers (Gore Motors). Enumerates the
 *    per-vehicle pages from the theme's listings-sitemap.xml. Browser-free.
 *  - `html` (default) — generic three-strategy HTML scraper, best-effort. These
 *    render client-side and/or sit behind bot challenges, so they usually only
 *    yield data with SCRAPE_JS_FALLBACK=1 and Chromium installed.
 */

import dealersConfig from "../config/dealers.json";
import { Scraper } from "./types";
import { makeScraper } from "./genericScraper";
import { makeConvertusScraper } from "./convertus";
import { makeStmMotorsScraper } from "./stmMotors";

interface DealerEntry {
  key: string;
  name: string;
  city: string;
  province: string;
  platform?: "convertus" | "stm" | "html";
  cp?: number;
  domain?: string;
  urls?: string[];
}

/** Hosts for platform dealers that have no scrapeable `urls` in the config. */
const DOMAINS: Record<string, string> = {
  waynetoyota: "www.waynetoyota.com",
  superiorhyundai: "www.superiorhyundai.ca",
};

/** Derive the dealer's host from `domain`, else its first URL, else the key. */
function dealerDomain(d: DealerEntry): string {
  if (d.domain) return d.domain;
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
  if (d.platform === "stm") {
    return makeStmMotorsScraper({
      key: d.key,
      source: d.name,
      domain: dealerDomain(d),
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
