/**
 * AutoTrader.ca — national aggregator, scraped per supported model.
 *
 * AutoTrader deliberately keeps its listing data out of machine-readable form:
 * the SSR JSON-LD has no per-listing year and the internal search API returns
 * only opaque ids. What *is* reliable is the rendered result tile — each tile
 * links to a VDP (/a/… URL) and shows "YYYY Make Model", price and km as text.
 *
 * So this scraper parses tiles: for every VDP anchor it finds the smallest
 * ancestor containing exactly one price (that's the tile; the results grid has
 * many prices) and reads year/price/km from its text. Make/model come from the
 * search URL we requested — never parsed — so titles are always right. The
 * static HTML usually contains a handful of server-rendered tiles; the
 * Playwright/rendering-service pass (free, open-source Chromium) fills in the
 * rest when available.
 */

import * as cheerio from "cheerio";
import { Listing } from "../types";
import { VEHICLE_MODELS } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { crawlPages, renderPage } from "./crawl";
import { loadScrapeConfig } from "./config";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";

const SLUGS: Record<string, string> = {
  "Toyota RAV4": "toyota/rav4",
  "Toyota Corolla": "toyota/corolla",
  "Honda Civic": "honda/civic",
  "Honda CR-V": "honda/cr-v",
  "Mazda Mazda3": "mazda/3",
  "Mazda CX-5": "mazda/cx-5",
  "Hyundai Elantra": "hyundai/elantra",
  "Hyundai Tucson": "hyundai/tucson",
  "Subaru Forester": "subaru/forester",
  "Subaru Crosstrek": "subaru/crosstrek",
};

interface ModelTarget {
  make: string;
  model: string;
  url: string;
}

const TARGETS: ModelTarget[] = VEHICLE_MODELS.flatMap((m) => {
  const slug = SLUGS[`${m.make} ${m.model}`];
  return slug
    ? [{ make: m.make, model: m.model, url: `https://www.autotrader.ca/cars/${slug}/on/?rcp=15&rcs=0&srt=9&prx=-1&hprc=True&wcp=True` }]
    : [];
});

const PRICE_G = /\$\s?(\d{1,3},\d{3})/g;

/** Element-boundary-aware text: cheerio's .text() concatenates adjacent nodes
 *  ("details2019", "372021"), which breaks token matching — strip tags with a
 *  space instead. */
function spacedText(outerHtml: string): string {
  return outerHtml
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse result tiles out of an AutoTrader search page (exported for tests). */
export function parseAutotraderTiles(html: string, make: string, model: string): RawVehicleRecord[] {
  const $ = cheerio.load(html);
  const out: RawVehicleRecord[] = [];
  const seen = new Set<string>();
  const modelRe = new RegExp(`\\b(20[0-2]\\d)\\b[^$]{0,60}${model.replace(/[^a-z0-9]+/gi, ".?")}`, "i");

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    // VDP links: /offers/{slug} (rendered tiles) or legacy /a/{...}.
    if (!/^(https?:\/\/[^/]*autotrader\.ca)?\/(offers|a)\/.+/i.test(href)) return;
    const key = href.split("?")[0];
    if (seen.has(key)) return;

    // Smallest ancestor whose text carries a price = the tile itself
    // (typically the <article>; the results grid above it has dozens).
    let node = $(a);
    let text = "";
    let prices: number[] = [];
    for (let depth = 0; depth < 6 && node.length; depth++) {
      text = spacedText($.html(node) ?? "");
      prices = [...text.matchAll(PRICE_G)]
        .map((m) => Number(m[1].replace(/,/g, "")))
        .filter((n) => n >= 3000 && n <= 200000);
      if (prices.length > 0) break;
      node = node.parent();
    }
    if (prices.length === 0 || prices.length > 4 || text.length > 6000) return;
    // If the ancestor we stopped at wraps several listings (results grid on a
    // sparse page), it isn't a tile.
    if (node.find('a[href*="/offers/"], a[href*="/a/"]').length > 1) return;

    const year = text.match(modelRe)?.[1] ?? text.match(/\b(20[0-2]\d)\b/)?.[1];
    if (!year) return;
    // Tiles often show current + struck-through "was" price; asking = lower.
    const price = Math.min(...prices);
    const km = text.match(/([\d,]{4,})\s*km\b/i)?.[1] ?? null;

    seen.add(key);
    // Title alone carries make+model — repeating them in make/model fields
    // would double up in normalize's haystack and pollute the trim.
    out.push({
      title: `${year} ${make} ${model}`,
      year,
      price,
      km: km ? `${km} km` : null,
      url: href,
      image: node.find('img[src^="http"]').first().attr("src") ?? null,
    });
  });
  return out;
}

export const autotrader: Scraper = {
  key: "autotrader",
  source: "AutoTrader.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    // Every supported model gets its own request — this is NOT sliced by
    // cfg.maxPagesPerSource (that knob caps how many pages a *generic* dealer
    // scraper fetches for ONE site; here each model is already its own single,
    // cheap page, ~0.6s each, so slicing it silently dropped 6 of the 10
    // supported models — Mazda3, CX-5, Elantra, Tucson, Forester, Crosstrek —
    // from ever being queried at all).
    const targets = TARGETS;
    const listings: Listing[] = [];
    const seen = new Set<string>();
    const meta = { sourceWebsite: "AutoTrader.ca", baseUrl: "https://www.autotrader.ca", province: "ON" };

    const collect = (html: string, t: ModelTarget) => {
      let added = 0;
      for (const raw of parseAutotraderTiles(html, t.make, t.model)) {
        const listing = normalizeRecord(raw, meta);
        if (listing && !seen.has(listing.dedupeKey)) {
          seen.add(listing.dedupeKey);
          listings.push(listing);
          added++;
        }
      }
      return added;
    };

    log("info", `AutoTrader.ca: fetching ${targets.length} model page(s)…`);
    const outcome = await crawlPages(targets.map((t) => t.url), log, {
      concurrency: cfg.concurrency,
      requestTimeoutSecs: Math.ceil(cfg.requestTimeoutMs / 1000),
    });
    for (const page of outcome.pages) {
      const t = targets.find((x) => x.url === page.url);
      if (t) collect(page.html, t);
    }

    // Static pages only carry a few server-rendered tiles; render the rest.
    if (cfg.jsFallbackEnabled && listings.length < targets.length * 3) {
      const toRender = targets.slice(0, Math.min(2, targets.length));
      log("info", `AutoTrader.ca: rendering ${toRender.length} page(s) for full tiles…`);
      for (const t of toRender) {
        const html = await renderPage(t.url, log);
        if (html) collect(html, t);
      }
    }

    const ok = listings.length > 0 || (!outcome.blocked && outcome.errors.length === 0);
    const note =
      listings.length > 0
        ? `${listings.length} supported-model listing(s) found`
        : `no listings extracted${outcome.blocked ? " (blocked from this network)" : ""}`;
    log(listings.length > 0 ? "info" : "warn", `AutoTrader.ca: ${note}`);
    return { key: "autotrader", source: "AutoTrader.ca", listings, ok, note };
  },
};
