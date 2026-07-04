/**
 * Config-driven scraper used by the static (HTML) sources. Fetches each URL
 * with the Cheerio crawler, runs the three-strategy extractor, normalizes to
 * `Listing` and drops unsupported models.
 *
 * Bounded by design: the URL list is sliced to `SCRAPE_MAX_PAGES`, every
 * request has a hard timeout, and the Playwright fallback only runs when it is
 * explicitly enabled (`SCRAPE_JS_FALLBACK=1`) — it needs Chromium and is slow,
 * and the primary sources are now browser-free JSON APIs. Between page parses
 * the event loop is yielded so the API stays responsive during a run.
 */

import { Listing } from "../types";
import { extractListings } from "./extract";
import { normalizeRecord, NormalizeMeta } from "./normalize";
import { crawlPages, fetchWithPlaywright } from "./crawl";
import { LogFn, Scraper, ScraperRunResult } from "./types";
import { loadScrapeConfig } from "./config";

export interface GenericScraperConfig {
  key: string;
  source: string;
  urls: string[];
  meta: Omit<NormalizeMeta, "sourceWebsite" | "baseUrl">;
  /** Retry the first URL with a real browser when the static pass finds nothing
   *  AND SCRAPE_JS_FALLBACK=1. */
  jsFallback?: boolean;
  /** Anti-bot protected source — expected to fail from datacenter IPs. */
  bestEffort?: boolean;
}

const yieldToEventLoop = () => new Promise<void>((r) => setImmediate(r));

export function makeScraper(config: GenericScraperConfig): Scraper {
  return {
    key: config.key,
    source: config.source,
    async run(log: LogFn): Promise<ScraperRunResult> {
      const cfg = loadScrapeConfig();
      const urls = config.urls.slice(0, cfg.maxPagesPerSource);
      const listings: Listing[] = [];
      const seen = new Set<string>();
      const baseUrl = new URL(urls[0]).origin;
      const meta: NormalizeMeta = { ...config.meta, sourceWebsite: config.source, baseUrl };

      log("info", `${config.source}: fetching ${urls.length} page(s)…`);
      const outcome = await crawlPages(urls, log, {
        concurrency: cfg.concurrency,
        requestTimeoutSecs: Math.ceil(cfg.requestTimeoutMs / 1000),
      });

      const collect = (html: string) => {
        for (const raw of extractListings(html)) {
          const listing = normalizeRecord(raw, meta);
          if (listing && !seen.has(listing.dedupeKey)) {
            seen.add(listing.dedupeKey);
            listings.push(listing);
          }
        }
      };

      for (const page of outcome.pages) {
        collect(page.html);
        await yieldToEventLoop(); // keep the API responsive between parses
      }

      if (listings.length === 0 && config.jsFallback && cfg.jsFallbackEnabled && urls.length > 0) {
        log("info", `${config.source}: static pass found nothing — trying browser fallback…`);
        const html = await fetchWithPlaywright(urls[0], log);
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
