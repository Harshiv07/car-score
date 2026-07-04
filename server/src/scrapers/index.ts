import { Scraper } from "./types";
import { autotrader } from "./autotrader";
import { cargurus } from "./cargurus";
import { clutch } from "./clutch";
import { dealerScrapers } from "./dealer";
import { loadScrapeConfig } from "./config";

/**
 * Every registered scraper. Clutch first: it's the browser-free JSON-API source
 * that reliably returns fully-structured data, so it anchors a run. The rest
 * are best-effort HTML sources whose live success depends on the host network
 * (many Canadian car sites block datacenter IPs).
 */
export const allScrapers: Scraper[] = [clutch, autotrader, cargurus, ...dealerScrapers];

/** The scrapers to actually run, honoring the SCRAPE_SOURCES allow-list. */
export function activeScrapers(): Scraper[] {
  const { enabledSourceKeys } = loadScrapeConfig();
  if (!enabledSourceKeys) return allScrapers;
  const set = new Set(enabledSourceKeys);
  const chosen = allScrapers.filter((s) => set.has(s.key.toLowerCase()));
  return chosen.length ? chosen : allScrapers;
}

// Back-compat: some callers import `scrapers` directly.
export const scrapers = allScrapers;
