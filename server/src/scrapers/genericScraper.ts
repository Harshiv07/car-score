/**
 * Config-driven scraper used by every source module. Fetches each URL with
 * the Cheerio crawler, runs the three-strategy extractor, normalizes to
 * `Listing` and drops unsupported models. If nothing is found and the source
 * is flagged `jsFallback`, one Playwright pass is attempted on the first URL
 * (fallback only, per design).
 */

import { Listing } from "../types";
import { extractListings } from "./extract";
import { normalizeRecord, NormalizeMeta } from "./normalize";
import { crawlPages, fetchWithPlaywright } from "./crawl";
import { LogFn, Scraper, ScraperRunResult } from "./types";

export interface GenericScraperConfig {
  key: string;
  source: string;
  urls: string[];
  meta: Omit<NormalizeMeta, "sourceWebsite" | "baseUrl">;
  /** Retry the first URL with a real browser when the static pass finds nothing. */
  jsFallback?: boolean;
  /** Anti-bot protected source — expected to fail from datacenter IPs. */
  bestEffort?: boolean;
}

export function makeScraper(config: GenericScraperConfig): Scraper {
  return {
    key: config.key,
    source: config.source,
    async run(log: LogFn): Promise<ScraperRunResult> {
      const listings: Listing[] = [];
      const seen = new Set<string>();
      const baseUrl = new URL(config.urls[0]).origin;
      const meta: NormalizeMeta = { ...config.meta, sourceWebsite: config.source, baseUrl };

      log("info", `${config.source}: fetching ${config.urls.length} page(s)…`);
      const outcome = await crawlPages(config.urls, log);

      const collect = (html: string) => {
        for (const raw of extractListings(html)) {
          const listing = normalizeRecord(raw, meta);
          if (listing && !seen.has(listing.dedupeKey)) {
            seen.add(listing.dedupeKey);
            listings.push(listing);
          }
        }
      };

      for (const page of outcome.pages) collect(page.html);

      if (listings.length === 0 && config.jsFallback && config.urls.length > 0) {
        log("info", `${config.source}: static pass found nothing — trying browser fallback…`);
        const html = await fetchWithPlaywright(config.urls[0], log);
        if (html) collect(html);
      }

      const blockedNote = outcome.blocked
        ? " (source appears to block automated access from this network)"
        : "";
      const ok = listings.length > 0 || (!outcome.blocked && outcome.errors.length === 0);
      const note =
        listings.length > 0
          ? `${listings.length} supported-model listing(s) found`
          : config.bestEffort
            ? `no listings extracted${blockedNote} — best-effort source, skipped`
            : `no listings extracted${blockedNote}`;
      log(listings.length > 0 ? "info" : "warn", `${config.source}: ${note}`);
      return { key: config.key, source: config.source, listings, ok, note };
    },
  };
}
