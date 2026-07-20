/**
 * CarGurus.ca — best-effort, browser-only (no paid unblocking service).
 *
 * CarGurus sits behind DataDome, which blocks primarily on IP reputation, not
 * bot fingerprint. Verified directly, live, before settling on this design —
 * three different open-source techniques were tried from this environment and
 * all three got an identical DataDome 403 (confirmed via the response body
 * containing DataDome's own challenge script, `var dd={'rt':'i','cid':...`):
 *   1. Plain Playwright/Chromium.
 *   2. Crawlee's PlaywrightCrawler with realistic fingerprint injection
 *      (navigator/WebGL/device spoofing via @crawlee/browser-pool).
 *   3. playwright-extra + puppeteer-extra-plugin-stealth (patches the CDP
 *      automation signatures — the same technique undetected-chromedriver
 *      uses for Selenium, and what crawl4ai's stealth layer is built on).
 * Puppeteer and Selenium automate the same Chromium via the same CDP protocol
 * Playwright does, so they aren't a different detection surface; Scrapy
 * doesn't execute JS at all, and this data only exists after Remix hydration.
 * None of the "look more like a human browser" techniques change the one
 * thing that actually matters here — the IP the request comes from — so none
 * of them were kept as a dependency (this used to call Scrapfly, a paid
 * service whose non-datacenter proxy tier *did* get through; removed by
 * request in favour of this free-but-honestly-best-effort approach).
 *
 * The reverse-engineered parts are kept because they're real, verified work
 * independent of the blocking problem: CarGurus's current site is a Remix
 * app, and the search results are server-rendered directly into
 * `window.__remixContext.state.loaderData["routes/($intl).search"].search`
 * — not in JSON-LD or any of extract.ts's generic strategies. Queried
 * **per model** via CarGurus's own `makeModelTrimPaths` filter (an internal
 * "m<make>/d<model>" id pair — see MODEL_PATHS) rather than an unfiltered
 * "used cars near X" search, because an unfiltered page returns whatever the
 * sort surfaces first: on a live test page, 1 of our 10 supported models out
 * of 24 results. The moment this runs from an IP DataDome doesn't flag (a
 * residential connection, a future unblocking mechanism, whatever), this
 * will correctly pull real, accurate data with no code changes needed.
 *
 * To avoid burning a full browser launch on 9 more doomed attempts once the
 * first one is blocked, only the first model is tried up front; the rest
 * only run if that one actually returns real data (i.e. this environment
 * genuinely isn't blocked right now).
 *
 * A later pass looked for ANY browser-free path and found none: the search
 * endpoint, `/sitemap.xml` and the sitemap index are all DataDome-403; the
 * homepage loads but embeds no listing data; individual VDP links return a
 * data-less stub. There is simply no server-rendered / API / sitemap route to
 * the listing data — it only exists behind the DataDome-gated search. So this
 * stays best-effort by design; AutoTrader + Clutch carry the listing count.
 */

import { Listing } from "../types";
import { matchModelFromTitle } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { renderPage } from "./crawl";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { loadScrapeConfig } from "./config";

const ZIP = "P7B"; // Thunder Bay
const DISTANCE = 250; // km
const SEARCH_BASE = "https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action";

/**
 * CarGurus's internal make/model filter path ("m<makeId>/d<modelId>"),
 * resolved live by selecting each make and reading its nested model facet
 * (see git history for the exact discovery steps). These are CarGurus's own
 * ontology ids, not expected to change often, but if a model starts coming
 * back empty, re-resolve it: render `${SEARCH_BASE}?zip=P7B&distance=250
 * &makeModelTrimPaths=<makeId>` (e.g. m7 for Toyota) and read
 * `search.filters.MAKE_MODEL.filters[].filters[]` from the same
 * __remixContext blob this scraper parses.
 */
export const MODEL_PATHS: Record<string, string> = {
  "Toyota RAV4": "m7/d306",
  "Toyota Corolla": "m7/d295",
  "Honda Civic": "m6/d586",
  "Honda CR-V": "m6/d589",
  "Mazda Mazda3": "m42/d214",
  "Mazda CX-5": "m42/d2133",
  "Hyundai Elantra": "m28/d92",
  "Hyundai Tucson": "m28/d98",
  "Subaru Forester": "m53/d374",
  "Subaru Crosstrek": "m53/d2387",
};

interface CargurusTile {
  data?: {
    id?: number;
    vin?: string;
    listingTitle?: string;
    localizedDrivetrain?: string;
    localizedEngineName?: string;
    localizedTransmission?: string;
    mileageData?: { value?: number };
    priceData?: { current?: number };
    exteriorColorData?: { localized?: string; name?: string };
    pictureData?: { url?: string };
    ontologyData?: { makeName?: string; modelName?: string; trimName?: string; carYear?: string | number };
    sellerData?: { city?: string; region?: string; serviceProviderName?: string };
  };
}

/** Find the index of the closing brace matching the '{' at `start` (string-aware). */
function matchBrace(s: string, start: number): number {
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
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

interface SearchData {
  tiles: CargurusTile[];
  pageCount: number;
  totalListings: number;
}

/** Pull `search.tiles`/`pageCount`/`totalListings` out of the page's embedded
 *  Remix router context. Returns null if the page doesn't have one (site
 *  changed, or a challenge page came back instead of the real result). */
export function extractRemixSearch(html: string): SearchData | null {
  const marker = "window.__remixContext = {";
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = idx + marker.length - 1;
  const end = matchBrace(html, start);
  if (end === -1) return null;
  try {
    const ctx = JSON.parse(html.slice(start, end + 1));
    const search = ctx?.state?.loaderData?.["routes/($intl).search"]?.search;
    if (!search || !Array.isArray(search.tiles)) return null;
    return { tiles: search.tiles, pageCount: search.pageCount ?? 1, totalListings: search.totalListings ?? 0 };
  } catch {
    return null;
  }
}

/** Map one CarGurus tile to the shared raw shape the normalizer understands. */
export function cargurusTileToRaw(tile: CargurusTile): RawVehicleRecord | null {
  const d = tile.data;
  if (!d?.id) return null;
  const o = d.ontologyData ?? {};
  const make = o.makeName ?? "";
  const model = o.modelName ?? "";
  const trim = o.trimName ?? "";
  const drive = d.localizedDrivetrain ?? "";
  return {
    title: [o.carYear, make, model, trim, drive].filter(Boolean).join(" "),
    make,
    model,
    trim: trim || null,
    year: o.carYear ?? "",
    price: typeof d.priceData?.current === "number" ? d.priceData.current : null,
    km: typeof d.mileageData?.value === "number" ? d.mileageData.value : null,
    drivetrain: drive || null,
    engine: d.localizedEngineName ?? null,
    transmission: d.localizedTransmission ?? null,
    exteriorColour: d.exteriorColorData?.localized ?? d.exteriorColorData?.name ?? null,
    vin: d.vin ?? null,
    url: `https://www.cargurus.ca/details/${d.id}`,
    image: d.pictureData?.url ?? null,
  };
}

function ingestTiles(tiles: CargurusTile[], listings: Listing[], seen: Set<string>): number {
  let added = 0;
  for (const tile of tiles) {
    const raw = cargurusTileToRaw(tile);
    if (!raw || !matchModelFromTitle(`${raw.make} ${raw.model}`)) continue;
    const d = tile.data!;
    const listing = normalizeRecord(raw, {
      sourceWebsite: "CarGurus.ca",
      baseUrl: "https://www.cargurus.ca",
      dealer: d.sellerData?.serviceProviderName ?? null,
      city: d.sellerData?.city ?? null,
      province: d.sellerData?.region ?? "ON",
    });
    if (listing && !seen.has(listing.dedupeKey)) {
      seen.add(listing.dedupeKey);
      listings.push(listing);
      added++;
    }
  }
  return added;
}

function modelUrl(path: string, page: number): string {
  return (
    `${SEARCH_BASE}?` +
    new URLSearchParams({
      sourceContext: "carGurusHomePageModel",
      zip: ZIP,
      distance: String(DISTANCE),
      makeModelTrimPaths: path,
      page: String(page),
    }).toString()
  );
}

/** Render + ingest every page for one model. Returns how many listings were
 *  added (0 doesn't necessarily mean blocked — could be genuinely no stock;
 *  `reachable` tells the two apart). */
async function runModel(
  modelKey: string,
  path: string,
  pagesPerModel: number,
  listings: Listing[],
  seen: Set<string>,
  log: LogFn
): Promise<{ added: number; reachable: boolean }> {
  let added = 0;
  let reachable = false;
  for (let page = 1; page <= pagesPerModel; page++) {
    const html = await renderPage(modelUrl(path, page), log);
    if (!html) break;
    const search = extractRemixSearch(html);
    if (!search) break;
    reachable = true;
    added += ingestTiles(search.tiles, listings, seen);
    if (page >= search.pageCount) break;
  }
  return { added, reachable };
}

export const cargurus: Scraper = {
  key: "cargurus",
  source: "CarGurus.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    if (!cfg.jsFallbackEnabled) {
      const note = "browser fallback disabled (SCRAPE_JS_FALLBACK=0) — best-effort source, skipped";
      log("warn", `CarGurus.ca: ${note}`);
      return { key: "cargurus", source: "CarGurus.ca", listings: [], ok: true, note };
    }
    const pagesPerModel = Math.max(1, Math.min(cfg.maxPagesPerSource, 3));
    const listings: Listing[] = [];
    const seen = new Set<string>();
    const failedModels: string[] = [];
    const entries = Object.entries(MODEL_PATHS);

    log("info", `CarGurus.ca: trying ${entries[0][0]} first (best-effort — see README for why)…`);
    const [firstKey, firstPath] = entries[0];
    const first = await runModel(firstKey, firstPath, pagesPerModel, listings, seen, log);

    if (!first.reachable) {
      // This environment's IP is blocked right now — trying the other 9
      // would just be 9 more slow, doomed browser launches. Stop here; the
      // dealer/Clutch/AutoTrader sources this run already has (or will get)
      // are unaffected either way.
      const note = "no listings extracted (source appears to block automated access from this network) — best-effort source, skipped";
      log("warn", `CarGurus.ca: ${note}`);
      return { key: "cargurus", source: "CarGurus.ca", listings: [], ok: true, note };
    }
    if (first.added === 0) failedModels.push(firstKey); // reachable but nothing matched right now — track, don't alarm

    log("info", `CarGurus.ca: reachable from this network — querying the remaining ${entries.length - 1} model(s)…`);
    for (const [modelKey, path] of entries.slice(1)) {
      const { added, reachable } = await runModel(modelKey, path, pagesPerModel, listings, seen, log);
      if (!reachable || added === 0) failedModels.push(modelKey);
    }

    const ok = listings.length > 0 || failedModels.length < entries.length;
    const note =
      listings.length > 0
        ? `${listings.length} supported-model listing(s) found` +
          (failedModels.length ? ` (${failedModels.join(", ")} unreachable)` : "")
        : "no supported-model listings found across any model";
    log(listings.length > 0 ? "info" : "warn", `CarGurus.ca: ${note}`);
    return { key: "cargurus", source: "CarGurus.ca", listings, ok, note };
  },
};
