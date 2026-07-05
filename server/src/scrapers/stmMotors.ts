/**
 * STM Motors dealers (WordPress "Motors" theme, e.g. Gore Motors Honda).
 *
 * The inventory index and its filter AJAX sit behind a Cloudflare browser
 * challenge, but the per-vehicle detail pages (VDPs) are plain server-rendered
 * HTML that a normal GET can read. The theme also publishes a
 * `listings-sitemap.xml`, so we enumerate the VDP URLs from there (each slug
 * carries year-make-model), then read price + mileage off each page. Fully
 * browser-free.
 */

import { Listing } from "../types";
import { normalizeRecord } from "./normalize";
import { crawlPages } from "./crawl";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";
import * as cheerio from "cheerio";

export interface StmDealer {
  key: string;
  source: string;
  domain: string; // e.g. "goremotorshonda.com"
  city?: string;
  province?: string;
}

/** "/listings/2019-honda-civic-touring/" → "2019 Honda Civic Touring" */
function slugToTitle(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(seg)
      .replace(/-/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

/** Parse a dollar amount that may use space or comma thousands separators. */
function parsePrice(html: string, $: cheerio.CheerioAPI): number | null {
  const candidates: number[] = [];
  $('[class*="price"]').each((_, el) => {
    const m = $(el).text().match(/\$\s?([\d][\d ,]{3,})/);
    if (m) candidates.push(Number(m[1].replace(/[ ,]/g, "")));
  });
  if (candidates.length === 0) {
    for (const m of html.matchAll(/\$\s?([\d][\d ,]{3,})/g)) candidates.push(Number(m[1].replace(/[ ,]/g, "")));
  }
  // The asking price is the largest plausible vehicle price (ignore payments).
  const plausible = candidates.filter((n) => n >= 3000 && n <= 200000);
  return plausible.length ? Math.max(...plausible) : null;
}

function parseKm(html: string): number | null {
  const m = html.match(/([\d][\d ,]{2,})\s*km\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[ ,]/g, ""));
  return Number.isFinite(n) && n > 100 ? n : null;
}

export function parseStmVehicle(url: string, html: string): RawVehicleRecord | null {
  const $ = cheerio.load(html);
  const title = slugToTitle(url);
  if (!/\b(19|20)\d\d\b/.test(title)) return null;
  return {
    title,
    year: title,
    price: parsePrice(html, $),
    km: parseKm(html),
    url,
    image: $('meta[property="og:image"]').attr("content") ?? null,
  };
}

async function vdpUrls(domain: string, timeoutMs: number): Promise<string[]> {
  const res = await fetchWithTimeout(`https://${domain}/listings-sitemap.xml`, {
    headers: BROWSER_HEADERS,
    timeoutMs,
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => /\/listings\/\d{4}-/.test(u));
}

export function makeStmMotorsScraper(dealer: StmDealer): Scraper {
  return {
    key: dealer.key,
    source: dealer.source,
    async run(log: LogFn): Promise<ScraperRunResult> {
      const cfg = loadScrapeConfig();
      let urls: string[];
      try {
        urls = await vdpUrls(dealer.domain, cfg.requestTimeoutMs);
      } catch (e) {
        log("warn", `${dealer.source}: sitemap fetch failed — ${(e as Error).message.slice(0, 80)}`);
        return { key: dealer.key, source: dealer.source, listings: [], ok: false, note: "sitemap unreachable" };
      }
      const cap = Math.min(urls.length, cfg.maxPagesPerSource * 12);
      urls = urls.slice(0, cap);
      log("info", `${dealer.source}: reading ${urls.length} vehicle page(s) from sitemap…`);
      if (urls.length === 0) {
        return { key: dealer.key, source: dealer.source, listings: [], ok: true, note: "no vehicles in sitemap" };
      }

      const outcome = await crawlPages(urls, log, {
        concurrency: cfg.concurrency,
        requestTimeoutSecs: Math.ceil(cfg.requestTimeoutMs / 1000),
      });

      const listings: Listing[] = [];
      const seen = new Set<string>();
      for (const page of outcome.pages) {
        const raw = parseStmVehicle(page.url, page.html);
        if (!raw) continue;
        const listing = normalizeRecord(raw, {
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
        await new Promise((r) => setImmediate(r));
      }

      const ok = listings.length > 0 || (!outcome.blocked && outcome.errors.length < urls.length);
      const note =
        listings.length > 0
          ? `${listings.length} supported-model listing(s) found`
          : "no supported-model listings in current inventory";
      log(listings.length > 0 ? "info" : "warn", `${dealer.source}: ${note}`);
      return { key: dealer.key, source: dealer.source, listings, ok, note };
    },
  };
}
