/**
 * Dealership websites — fully configurable via src/config/dealers.json.
 * Add a dealer entry (name, city, province, inventory URLs) and it is
 * scraped with the generic three-strategy extractor; no code changes needed.
 */

import dealersConfig from "../config/dealers.json";
import { Scraper } from "./types";
import { makeScraper } from "./genericScraper";

interface DealerEntry {
  key: string;
  name: string;
  city: string;
  province: string;
  urls: string[];
}

export const dealerScrapers: Scraper[] = (dealersConfig.dealers as DealerEntry[]).map((d) =>
  makeScraper({
    key: d.key,
    source: d.name,
    urls: d.urls,
    meta: { dealer: d.name, city: d.city, province: d.province },
    jsFallback: true,
  })
);
