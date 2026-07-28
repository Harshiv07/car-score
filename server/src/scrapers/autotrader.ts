/**
 * AutoTrader.ca — Canada-wide used listings, scraped per supported model and
 * browser-free (works on Render).
 *
 * AutoTrader.ca is a Next.js app (AutoScout24 "search-funnel"). Its
 * server-rendered HTML embeds a clean, fully-structured `"listings":[…]` array
 * inside `__NEXT_DATA__` — each item carries `vehicle.modelYear`,
 * `vehicle.mileageInKm`, `price.priceRaw` (real CAD), `modelVersionInput`
 * (trim), fuel/transmission, `location` (province/city) and a real VDP `url`.
 * We parse that JSON directly (far cleaner than scraping visible tile text).
 *
 * Two things make this scale browser-free, both verified live:
 *   - Pagination works via `&page=N` (each page is a *different* 20 listings;
 *     `rcs=` does NOT paginate — it just re-returns page 1, which is why the
 *     old approach was stuck at ~20/model).
 *   - Dropping `prx=-1` scopes results to the province in the path (with it the
 *     national — AB/BC/QC/…; without it every result is ON).
 *
 * `parseAutotraderTiles` (the older visible-tile text parser) is kept as a
 * fallback for any page where the `__NEXT_DATA__` blob can't be extracted
 * (e.g. a future markup change), so the source degrades instead of breaking.
 */

import * as cheerio from "cheerio";
import { Listing } from "../types";
import { VEHICLE_MODELS } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { crawlPages } from "./crawl";
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
  slug: string;
}

const TARGETS: ModelTarget[] = VEHICLE_MODELS.flatMap((m) => {
  const slug = SLUGS[`${m.make} ${m.model}`];
  return slug ? [{ make: m.make, model: m.model, slug }] : [];
});

/**
 * Provinces AutoTrader serves on this URL shape, in rough inventory order.
 *
 * The crawler was pinned to `/on/` and so ignored the rest of the country.
 * Verified live, page 1 of each: every province returns 200 with real listings
 * and its own `numberOfPages`, and the parsed rows carry the right province
 * code — so this is more cars from a source that already works browser-free,
 * not a new anti-bot surface.
 *
 *   Toyota RAV4   ON 106 pages   rest of Canada 139
 *   Honda Civic   ON 174 pages   rest of Canada 175
 *
 * Override with AUTOTRADER_PROVINCES (comma-separated) to narrow a run.
 */
export const AUTOTRADER_PROVINCES: readonly string[] = ["on", "bc", "qc", "ab", "ns", "nb", "mb", "sk", "nl", "pe"];

export function activeProvinces(): string[] {
  const raw = (process.env.AUTOTRADER_PROVINCES ?? "").trim();
  if (!raw) return [...AUTOTRADER_PROVINCES];
  const wanted = raw.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const valid = wanted.filter((p) => (AUTOTRADER_PROVINCES as readonly string[]).includes(p));
  return valid.length ? valid : [...AUTOTRADER_PROVINCES];
}

/** Page URL for a model within one province (`&page=N` paginates). */
export function pageUrl(slug: string, page: number, province = "on"): string {
  return `https://www.autotrader.ca/cars/${slug}/${province}/?rcp=100&srt=9&hprc=True&wcp=True&page=${page}`;
}

/** A parsed AutoTrader listing plus its real location (province/city aren't part
 *  of RawVehicleRecord — they flow to normalize via per-listing meta). */
export interface AutotraderRow {
  raw: RawVehicleRecord;
  province: string | null;
  city: string | null;
}

/** Find the index of the bracket matching the one at `start` (string-aware). */
function matchBracket(s: string, start: number, open: string, close: string): number {
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
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * `modelVersionInput` is a free-text, dealer-entered field — sometimes a clean
 * trim ("XLE"), often marketing junk ("RAV4 Blowout Sale - 30+ in stock",
 * "LE | AWD | REAR CAMERA | HEATED SEATS"). Take the first real segment and
 * drop anything that reads like a marketing blurb; null when nothing clean.
 */
function cleanTrim(s: string | null | undefined): string | null {
  if (!s) return null;
  const first = s.split(/\s*[|\n·•/]\s*|\s+-\s+/)[0].trim();
  if (!first || first.length > 22) return null;
  if (/\d{3,}|\bsale|stock|special|blowout|clearance|camera|seats?|carfax|financ|warranty|certified|accident|available|\bcall\b|www\.|http/i.test(first)) {
    return null;
  }
  return first;
}

interface NextListing {
  url?: string;
  images?: string[];
  price?: { priceRaw?: number };
  location?: { provinceCode?: string; city?: string };
  vehicle?: {
    modelYear?: number;
    mileageInKm?: string;
    modelVersionInput?: string | null;
    transmission?: string | null;
    fuel?: string | null;
  };
}

/**
 * Parse the `__NEXT_DATA__` `"listings"` array out of an AutoTrader search page.
 * make/model come from the per-model URL we requested (never parsed), so model
 * matching stays exact. Returns the rows plus the search's total page count.
 */
export function parseAutotraderNextData(
  html: string,
  make: string,
  model: string
): { rows: AutotraderRow[]; numberOfPages: number } {
  const marker = '"listings":[';
  const i = html.indexOf(marker);
  if (i === -1) return { rows: [], numberOfPages: 1 };
  const arrStart = i + marker.length - 1;
  const arrEnd = matchBracket(html, arrStart, "[", "]");
  if (arrEnd === -1) return { rows: [], numberOfPages: 1 };

  let items: NextListing[];
  try {
    items = JSON.parse(html.slice(arrStart, arrEnd + 1)) as NextListing[];
  } catch {
    return { rows: [], numberOfPages: 1 };
  }

  const npMatch = html.slice(Math.max(0, i - 300), i).match(/"numberOfPages":(\d+)/);
  const numberOfPages = npMatch ? Number(npMatch[1]) : 1;

  const rows: AutotraderRow[] = [];
  for (const it of items) {
    const v = it.vehicle ?? {};
    const year = v.modelYear;
    const price = it.price?.priceRaw;
    if (!year || typeof price !== "number") continue; // skip ads/placeholders
    rows.push({
      // Title is just year+make+model (make/model from the URL, so matching is
      // exact); trim + fuel are passed as explicit fields so neither has to
      // ride in the title where it'd pollute normalize's trim extraction.
      raw: {
        title: `${year} ${make} ${model}`,
        year,
        price,
        km: v.mileageInKm ?? null,
        trim: cleanTrim(v.modelVersionInput),
        // Drivetrain isn't its own field, but dealers often put it in the trim
        // blob ("LE | AWD | …") — pull just the token so it survives the trim
        // cleanup and normalize can infer AWD/FWD from it.
        drivetrain: /\b(awd|4wd|4x4|fwd|2wd|rwd)\b/i.exec(v.modelVersionInput ?? "")?.[0] ?? null,
        fuel: v.fuel ?? null,
        transmission: v.transmission ?? null,
        url: it.url ?? null,
        image: it.images?.[0] ?? null,
      },
      province: it.location?.provinceCode ?? null,
      city: it.location?.city ?? null,
    });
  }
  return { rows, numberOfPages };
}

/* ---- fallback: visible-tile text parser (used only if __NEXT_DATA__ fails) -- */

const PRICE_G = /\$\s?(\d{1,3},\d{3})/g;

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
    if (!/^(https?:\/\/[^/]*autotrader\.ca)?\/(offers|a)\/.+/i.test(href)) return;
    const key = href.split("?")[0];
    if (seen.has(key)) return;

    let node = $(a);
    let text = "";
    let prices: number[] = [];
    for (let depth = 0; depth < 6 && node.length; depth++) {
      text = spacedText($.html(node) ?? "");
      prices = [...text.matchAll(PRICE_G)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => n >= 3000 && n <= 200000);
      if (prices.length > 0) break;
      node = node.parent();
    }
    if (prices.length === 0 || prices.length > 4 || text.length > 6000) return;
    if (node.find('a[href*="/offers/"], a[href*="/a/"]').length > 1) return;

    const year = text.match(modelRe)?.[1] ?? text.match(/\b(20[0-2]\d)\b/)?.[1];
    if (!year) return;
    const price = Math.min(...prices);
    const km = text.match(/([\d,]{4,})\s*km\b/i)?.[1] ?? null;

    seen.add(key);
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
    const pagesPerModel = Math.max(1, cfg.autotraderPagesPerModel);
    const deadline = Date.now() + cfg.sourceTimeoutMs - 5000;
    const listings: Listing[] = [];
    const seen = new Set<string>();
    const baseUrl = "https://www.autotrader.ca";

    // Keyed by model *and* province: a model has a different depth in each.
    const urlToTarget = new Map<string, { target: ModelTarget; province: string }>();
    const numberOfPagesByCombo = new Map<string, number>();
    const comboKey = (t: ModelTarget, province: string) => `${t.make} ${t.model}|${province}`;
    const provinces = activeProvinces();

    /** Parse one fetched page (JSON primary, tile-parser fallback) into `listings`. */
    const collect = (html: string, target: ModelTarget, requested: string): number => {
      const { rows, numberOfPages } = parseAutotraderNextData(html, target.make, target.model);
      numberOfPagesByCombo.set(comboKey(target, requested), numberOfPages);

      const fallbackProvince = requested.toUpperCase();
      let effective: AutotraderRow[] = rows;
      if (rows.length === 0) {
        // __NEXT_DATA__ missing/changed — fall back to the visible tiles. The
        // province we asked for is the right default, not a hard-coded "ON".
        effective = parseAutotraderTiles(html, target.make, target.model).map((raw) => ({
          raw,
          province: fallbackProvince,
          city: null,
        }));
      }

      let added = 0;
      for (const { raw, province, city } of effective) {
        const listing = normalizeRecord(raw, {
          sourceWebsite: "AutoTrader.ca",
          baseUrl,
          province: province ?? fallbackProvince,
          city,
        });
        if (listing && !seen.has(listing.dedupeKey)) {
          seen.add(listing.dedupeKey);
          listings.push(listing);
          added++;
        }
      }
      return added;
    };

    const fetchAndCollect = async (urls: string[]): Promise<void> => {
      const outcome = await crawlPages(urls, log, {
        concurrency: cfg.concurrency,
        requestTimeoutSecs: Math.ceil(cfg.requestTimeoutMs / 1000),
      });
      for (const page of outcome.pages) {
        const hit = urlToTarget.get(page.url);
        if (hit) collect(page.html, hit.target, hit.province);
      }
    };

    // Phase 1 — breadth: page 1 of every model in every province. This is what
    // learns each combination's real depth, and on its own it already covers
    // the whole country rather than one province of it.
    log(
      "info",
      `AutoTrader.ca: fetching page 1 of ${TARGETS.length} model(s) across ${provinces.length} province(s)…`
    );
    const phase1: string[] = [];
    for (const t of TARGETS) {
      for (const province of provinces) {
        const url = pageUrl(t.slug, 1, province);
        urlToTarget.set(url, { target: t, province });
        phase1.push(url);
      }
    }
    await fetchAndCollect(phase1);

    // Phase 2 — pages 2..cap across all models, capped by each model's real
    // page count, interleaved so no single model hogs the budget.
    // Interleaved by page number first, so depth is spread evenly over every
    // model and province instead of one combination consuming the budget.
    const phase2: string[] = [];
    for (let page = 2; page <= pagesPerModel; page++) {
      for (const t of TARGETS) {
        for (const province of provinces) {
          const total = numberOfPagesByCombo.get(comboKey(t, province)) ?? 1;
          if (page > total) continue;
          const url = pageUrl(t.slug, page, province);
          urlToTarget.set(url, { target: t, province });
          phase2.push(url);
        }
      }
    }
    if (phase2.length && Date.now() < deadline) {
      log("info", `AutoTrader.ca: fetching ${phase2.length} more page(s) for depth…`);
      // Chunk so the deadline can interrupt between batches instead of after a
      // giant single crawl.
      const CHUNK = Math.max(cfg.concurrency, 8);
      for (let i = 0; i < phase2.length && Date.now() < deadline; i += CHUNK) {
        await fetchAndCollect(phase2.slice(i, i + CHUNK));
      }
    }

    const ok = listings.length > 0;
    const note = listings.length > 0 ? `${listings.length} listing(s) found across ${provinces.length} province(s)` : "no listings extracted";
    log(ok ? "info" : "warn", `AutoTrader.ca: ${note}`);
    return { key: "autotrader", source: "AutoTrader.ca", listings, ok, note };
  },
};
