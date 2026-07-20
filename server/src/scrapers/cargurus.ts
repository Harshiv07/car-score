/**
 * CarGurus.ca — via Scrapfly (scrapfly.io), a paid scraping API whose ASP
 * ("anti-scraping protection") mode routes through non-datacenter proxies.
 * That's the one lever that can plausibly get past CarGurus's DataDome, which
 * blocks primarily on IP reputation — confirmed dead ends first: a plain
 * fetch, a full local Chromium session, and ScrapingBee's standard rendering
 * tier all got an identical 403/empty-result from the same IP. Verified live
 * against the real API before wiring this in (see git history) rather than
 * assuming it would work.
 *
 * CarGurus's current site is a Remix app: the search results aren't in
 * JSON-LD or any of extract.ts's generic strategies, they're inside
 * `window.__remixContext.state.loaderData["routes/($intl).search"].search`,
 * server-rendered directly into the HTML (no extra request needed once the
 * page itself is rendered). Queried **per model** via CarGurus's own
 * `makeModelTrimPaths` filter (an internal "m<make>/d<model>" id pair,
 * resolved once live per model — see MODEL_PATHS) rather than paginating an
 * unfiltered "used cars near X" search, for the same reason Clutch is queried
 * per model: an unfiltered page returns whatever the sort order surfaces
 * first, which is mostly NOT our 10 supported models.
 */

import { Listing } from "../types";
import { matchModelFromTitle } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { fetchWithTimeout, loadScrapeConfig } from "./config";

const ZIP = "P7B"; // Thunder Bay
const DISTANCE = 250; // km
const SEARCH_BASE = "https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action";

/**
 * CarGurus's internal make/model filter path ("m<makeId>/d<modelId>"),
 * resolved live by selecting each make and reading its nested model facet
 * (see git history for the exact discovery steps). These are CarGurus's own
 * ontology ids, not expected to change often, but if a model starts coming
 * back empty, re-resolve it: fetch `${SEARCH_BASE}?zip=P7B&distance=250
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

export function scrapflyConfigured(): boolean {
  return !!process.env.SCRAPFLY_API_KEY;
}

interface ScrapflyResult {
  html: string | null;
  failureReason?: string;
}

/** Render one URL through Scrapfly's ASP+JS-rendering tier. */
export async function fetchViaScrapfly(targetUrl: string, timeoutMs: number): Promise<ScrapflyResult> {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) return { html: null, failureReason: "SCRAPFLY_API_KEY not set" };
  const url =
    "https://api.scrapfly.io/scrape?" +
    new URLSearchParams({
      key: apiKey,
      url: targetUrl,
      render_js: "true",
      asp: "true",
      proxified_response: "true", // raw HTML back, no JSON envelope to unwrap
      country: "ca",
    }).toString();
  try {
    const res = await fetchWithTimeout(url, { timeoutMs });
    const body = await res.text();
    if (!res.ok) return { html: null, failureReason: `HTTP ${res.status}: ${body.slice(0, 200).replace(/\s+/g, " ")}` };
    if (!body || body.length < 2000) {
      return { html: null, failureReason: `response too short (${body.length} bytes): ${body.slice(0, 200).replace(/\s+/g, " ")}` };
    }
    return { html: body };
  } catch (e) {
    return { html: null, failureReason: `request threw: ${(e as Error).message.slice(0, 150)}` };
  }
}

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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch and ingest every page for one model. Mutates `listings`/`seen`/
 *  `failedModels` directly — safe under concurrency since JS only ever runs
 *  one of these bodies at a time between `await` points. */
async function runModel(
  modelKey: string,
  path: string,
  pagesPerModel: number,
  requestTimeoutMs: number,
  listings: Listing[],
  seen: Set<string>,
  failedModels: string[],
  log: LogFn
): Promise<void> {
  let modelFound = 0;
  let modelReachable = false;
  for (let page = 1; page <= pagesPerModel; page++) {
    const target =
      `${SEARCH_BASE}?` +
      new URLSearchParams({
        sourceContext: "carGurusHomePageModel",
        zip: ZIP,
        distance: String(DISTANCE),
        makeModelTrimPaths: path,
        page: String(page),
      }).toString();
    const result = await fetchViaScrapfly(target, requestTimeoutMs);
    if (!result.html) {
      if (page === 1) {
        failedModels.push(modelKey);
        log("warn", `CarGurus.ca: ${modelKey} — ${result.failureReason}`);
      }
      break;
    }
    const search = extractRemixSearch(result.html);
    if (!search) {
      if (page === 1) {
        failedModels.push(modelKey);
        log("warn", `CarGurus.ca: ${modelKey} — page rendered but no search data found (site may have changed)`);
      }
      break;
    }
    modelReachable = true;
    modelFound += ingestTiles(search.tiles, listings, seen);
    if (page >= search.pageCount) break;
    await delay(300);
  }
  if (modelFound === 0 && modelReachable) {
    log("warn", `CarGurus.ca: ${modelKey} — 0 listings (may be temporarily out of stock nearby)`);
  }
}

export const cargurus: Scraper = {
  key: "cargurus",
  source: "CarGurus.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    if (!scrapflyConfigured()) {
      const note = "Scrapfly not configured (SCRAPFLY_API_KEY unset) — best-effort source, skipped";
      log("warn", `CarGurus.ca: ${note}`);
      return { key: "cargurus", source: "CarGurus.ca", listings: [], ok: true, note };
    }

    const cfg = loadScrapeConfig();
    // One page (24 listings) per model by default: each Scrapfly call costs
    // real API credits (ASP + JS rendering), so this defaults conservative
    // rather than burning quota on deep pagination no one asked for.
    // SCRAPE_MAX_PAGES raises it if you want more depth.
    const pagesPerModel = Math.max(1, Math.min(cfg.maxPagesPerSource, 3));
    // Leave a safety margin before scrapeService.ts's own per-source timeout
    // (it races this whole run() against that timeout and discards the
    // ENTIRE result — including every model already found — if it loses).
    // CarGurus's real per-call latency is high enough that this matters more
    // here than almost anywhere else in the app: stop launching new batches
    // once close to the limit and return whatever's already in hand instead
    // of risking losing it all to the outer race.
    const deadline = Date.now() + cfg.sourceTimeoutMs - 8000;
    const listings: Listing[] = [];
    const seen = new Set<string>();
    const failedModels: string[] = [];
    const entries = Object.entries(MODEL_PATHS);

    log("info", `CarGurus.ca: querying ${entries.length} model(s) via Scrapfly (≤${pagesPerModel} page(s) each)…`);

    // Concurrency, not just a longer budget: unlike Clutch's hard WAF request-
    // count wall, Scrapfly is a paid, reliable service where the real
    // constraint is wall-clock time — each ASP+JS-render call took ~7s
    // running one at a time (verified live: 4/10 models completed sequentially
    // inside the default 30s per-source budget before it ran out), so all 10
    // sequentially needs real concurrency to fit. Concurrency=4 (matching
    // cfg.concurrency) was tried and several calls then aborted on the
    // generic 12s request timeout; that session also hit the account's
    // Scrapfly quota shortly after, so it's not certain how much of that
    // slowdown was genuine per-account throttling under concurrent load vs.
    // approaching the quota wall — a smaller concurrency with a timeout long
    // enough to absorb either is the safer default either way.
    const CONCURRENCY = 2;
    const REQUEST_TIMEOUT_MS = 25_000;
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      if (Date.now() >= deadline) {
        const remaining = entries.slice(i).map(([k]) => k);
        failedModels.push(...remaining);
        log("warn", `CarGurus.ca: ran out of time budget — stopping with ${listings.length} already found.`);
        break;
      }
      const batch = entries.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(([modelKey, path]) =>
          runModel(modelKey, path, pagesPerModel, REQUEST_TIMEOUT_MS, listings, seen, failedModels, log)
        )
      );
    }

    const ok = listings.length > 0 || failedModels.length < entries.length;
    const note =
      listings.length > 0
        ? `${listings.length} supported-model listing(s) found` +
          (failedModels.length ? ` (${failedModels.join(", ")} unreachable)` : "")
        : "no listings extracted (Scrapfly could not reach CarGurus for any model)";
    log(listings.length > 0 ? "info" : "warn", `CarGurus.ca: ${note}`);
    return { key: "cargurus", source: "CarGurus.ca", listings, ok, note };
  },
};
