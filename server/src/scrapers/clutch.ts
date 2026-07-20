/**
 * Clutch.ca — online used-car retailer, scraped through its public JSON API
 * (api.clutch.ca). Browser-free: it returns fully structured vehicles (year,
 * make, model, trim, mileage, drivetrain, fuel, province price), so it works on
 * hosts without Chromium (Render, etc.).
 *
 * Queried as ONE combined request listing all 5 makes + all 10 supported models
 * at once (`makes[]`×5, `models[]`×10), then paginated. The API returns every
 * page as a MIX of all requested models (e.g. page 0 already spans RAV4, CR-V,
 * CX-5, Elantra, Corolla, Civic…), so every model is represented on every run.
 * This replaced a per-model approach whose problem was the WAF: api.clutch.ca
 * sits behind AWS WAF that allows only ~4-6 requests per run before returning
 * an empty HTTP 202 challenge — and slowing the pacing doesn't help (verified:
 * 400ms vs 3000ms between requests made no difference; it's a request-COUNT
 * budget, not a rate limit). Per-model, that budget bought ~6 complete models
 * and left the other 4 with nothing.
 *
 * The combined query's own cross-model sort is NOT proportional, though —
 * verified live, repeatably: Toyota/Honda/Hyundai models land 15-40 listings
 * within the page budget while Mazda/Subaru models get only 2-4, even though
 * every model is in every request. `topUpUnderrepresentedModels` fixes this
 * once the main pagination is done — but a single shared request scoped to
 * every thin model reproduces the same skew inside that smaller subset
 * (verified live), so instead it issues one SINGLE-MODEL request per
 * under-represented model, most-deficient first, so each gets an entire page
 * to itself.
 *
 * When a real browser IS available (local dev with Chromium), a bonus tier
 * continues pagination from inside a WAF-cleared browser page to pull the
 * remaining pages the bare-fetch WAF budget couldn't. No-op on Render.
 */

import { Listing } from "../types";
import { matchModelFromTitle, VEHICLE_MODELS } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";
import { closeBrowserSession, fetchJsonInSession, openBrowserSession } from "./crawl";

const API = "https://api.clutch.ca/v1";
// Brampton, ON — verified live (clutch.ca/v1/locations) this only changes
// which province price/delivery fields are attached, not which vehicles are
// returned (the same query against 3 different Ontario location ids all
// returned identical totalCount + vehicle lists), so this is safe to pin to
// a concrete, real city rather than an arbitrary id. Overridable in case
// Clutch rotates ids.
const LOCATION_ID = process.env.CLUTCH_LOCATION_ID || "f44ec589-4108-4f38-a3bf-2097d65a05a6";
const PROVINCE = "ON";
// Hard ceiling on browser-tier continuation (~778 / 32 ≈ 25 pages = everything).
const ABSOLUTE_MAX_PAGES = 30;
// Below this many listings, a model is "under-represented" and gets a
// dedicated top-up query (see topUpUnderrepresentedModels) rather than being
// left to however few the combined query's own cross-model sort gave it. A
// single-model request reliably returns that model's real count in one page
// (verified live: Forester → 13/13, matching the live site) up to the API's
// own pageSize (32), so this is set well above "just enough to exist" to
// actually pull each model's full sample rather than settle early.
export const MIN_PER_MODEL = 20;

/** The supported models, derived from the knowledge base so this can never
 *  drift out of sync with what we score. Exported for the query builder + test. */
export const MODEL_TARGETS: { make: string; model: string }[] = VEHICLE_MODELS.map((m) => ({
  make: m.make,
  model: m.model,
}));

interface ClutchNamed {
  name?: string | null;
}
interface ClutchPrice {
  price?: number | null;
  promoPrice?: number | null;
}
interface ClutchVehicle {
  id?: number;
  year?: number;
  mileage?: number;
  make?: ClutchNamed;
  model?: ClutchNamed;
  trim?: ClutchNamed;
  drivetrain?: ClutchNamed;
  fuelType?: ClutchNamed;
  cardPhotoUrl?: string | null;
  vehiclePrices?: ClutchPrice[];
  visibleOnSite?: boolean;
  ["vehiclePrice-ON"]?: ClutchPrice;
}
interface ClutchPage {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  vehicles: ClutchVehicle[];
}

function priceOf(v: ClutchVehicle): number | null {
  const p = v["vehiclePrice-ON"]?.price ?? v.vehiclePrices?.[0]?.price ?? null;
  return typeof p === "number" ? p : null;
}

/** Map a Clutch API vehicle to the raw shape the shared normalizer understands. */
export function clutchToRaw(v: ClutchVehicle): RawVehicleRecord {
  const make = v.make?.name ?? "";
  const model = v.model?.name ?? "";
  const trim = v.trim?.name ?? "";
  const drive = v.drivetrain?.name ?? "";
  const fuel = v.fuelType?.name ?? "";
  const year = v.year ?? "";
  // Deep-link to the exact vehicle detail page (e.g. clutch.ca/vehicles/111414).
  const url = v.id != null ? `https://www.clutch.ca/vehicles/${v.id}` : "https://www.clutch.ca/cars";
  return {
    title: [year, make, model, trim].filter(Boolean).join(" "),
    make,
    model,
    trim: trim || null,
    year,
    price: priceOf(v),
    km: typeof v.mileage === "number" ? v.mileage : null,
    drivetrain: drive || null,
    fuel: fuel || null,
    url,
    image: v.cardPhotoUrl ?? null,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The API sits behind AWS WAF, which hands out an `aws-waf-token` cookie on the
 * first hit. We keep the cookie so later requests in the same run are trusted.
 */
let cookieJar = "";

function rememberCookies(res: Response): void {
  const setCookies =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const pairs = setCookies.map((c) => c.split(";")[0]).filter(Boolean);
  if (pairs.length) cookieJar = pairs.join("; ");
}

/**
 * Build a combined Clutch API query for one page across an arbitrary set of
 * (make, model) targets. The non-page params mirror exactly what the real
 * clutch.ca frontend sends — nothing extra, since a request shape no real
 * browser produces is exactly what WAF/bot detection flags.
 */
export function buildModelsQueryUrl(targets: { make: string; model: string }[], page: number): string {
  const makes = [...new Set(targets.map((t) => t.make))];
  const models = targets.map((t) => t.model);
  const p = new URLSearchParams();
  for (const mk of makes) p.append("makes[]", mk);
  for (const md of models) p.append("models[]", md);
  p.set("downPayment", "0");
  p.set("isBiweekly", "true");
  p.set("interestRate", "7.99");
  p.set("page", String(page));
  return `${API}/vehicles/locations/${LOCATION_ID}?${p.toString()}`;
}

/** All 10 supported models in one query — exported for a regression test. */
export function buildAllModelsQueryUrl(page: number): string {
  return buildModelsQueryUrl(MODEL_TARGETS, page);
}

async function fetchPageAt(url: string, timeoutMs: number): Promise<ClutchPage | null> {
  const res = await fetchWithTimeout(url, {
    headers: {
      ...BROWSER_HEADERS,
      Origin: "https://www.clutch.ca",
      Referer: "https://www.clutch.ca/",
      ...(cookieJar ? { Cookie: cookieJar } : {}),
    },
    timeoutMs,
  });
  rememberCookies(res);
  const text = await res.text();
  return res.ok && text.trim().startsWith("{") ? (JSON.parse(text) as ClutchPage) : null;
}

const fetchPage = (page: number, timeoutMs: number) => fetchPageAt(buildAllModelsQueryUrl(page), timeoutMs);

/** Normalize + dedupe a page's vehicles into `listings`. Returns how many were
 *  added. `matchModelFromTitle` keeps only the models we score (drops the
 *  "Corolla Cross"/"Civic Sedan"-style near-matches the combined query pulls in,
 *  keeps "RAV4 Hybrid" → RAV4). */
function ingestVehicles(vehicles: ClutchVehicle[], listings: Listing[], seen: Set<string>): number {
  let added = 0;
  for (const v of vehicles) {
    if (v.visibleOnSite === false) continue;
    if (!matchModelFromTitle(`${v.make?.name ?? ""} ${v.model?.name ?? ""}`)) continue;
    const listing = normalizeRecord(clutchToRaw(v), {
      sourceWebsite: "Clutch.ca",
      baseUrl: "https://www.clutch.ca",
      dealer: "Clutch",
      province: PROVINCE,
    });
    if (listing && !seen.has(listing.dedupeKey)) {
      seen.add(listing.dedupeKey);
      listings.push(listing);
      added++;
    }
  }
  return added;
}

/**
 * Whether bare-fetch pagination left pages on the table that the browser tier
 * should try to finish. `page < totalPages` covers every "didn't finish" case
 * uniformly: a mid-run WAF block, hitting the page cap with more pages left,
 * and even page 0 itself failing (totalPages is then still the unknown-
 * default of 1, but page(0) < 1 is still true) — a bare-fetch block on the
 * very first request is exactly when the browser tier matters most, so it
 * must not be skipped just because nothing succeeded yet (regression: an
 * earlier version special-cased "page 0 failed" as "unreachable, don't
 * bother," which silently disabled the entire browser tier whenever the WAF
 * challenged the very first request of a run — verified live, this is common).
 */
export function shouldContinueViaBrowser(page: number, totalPages: number, jsFallbackEnabled: boolean): boolean {
  return page < totalPages && jsFallbackEnabled;
}

/**
 * Bonus tier: once the bare-fetch WAF budget is spent, continue paginating from
 * inside a real, WAF-cleared browser page (the in-page fetch inherits the
 * browser's solved challenge). Pulls pages `[startPage, totalPages)` up to a
 * hard cap / deadline. No-ops if no browser is available (Render) or if the
 * browser is itself blocked. Verified to be a genuine bonus only where a
 * browser + unflagged IP exist (local dev); harmless everywhere else.
 */
async function continueViaBrowser(
  startPage: number,
  totalPages: number,
  listings: Listing[],
  seen: Set<string>,
  deadline: number,
  log: LogFn
): Promise<number> {
  // totalPages may just be the unknown-default (1) if bare fetch never got a
  // single page back (e.g. page 0 itself was WAF-challenged) — that must NOT
  // stop this from trying; it just means the real bound isn't known yet, so
  // it's re-derived below from the browser's own first successful page.
  let lastPage = Math.min(totalPages, ABSOLUTE_MAX_PAGES);
  if (Date.now() >= deadline) return 0;
  const session = await openBrowserSession("https://www.clutch.ca/cars", log);
  if (!session) return 0; // no browser on this host — graceful no-op

  let added = 0;
  try {
    log("info", `Clutch.ca: continuing pagination via a real browser session (page ${startPage}+)…`);
    for (let page = startPage; page < lastPage && Date.now() < deadline; page++) {
      const text = await fetchJsonInSession(session, buildAllModelsQueryUrl(page));
      if (!text) break; // browser is blocked too — stop
      try {
        const data = JSON.parse(text) as ClutchPage;
        if (data.totalPages) lastPage = Math.min(data.totalPages, ABSOLUTE_MAX_PAGES);
        added += ingestVehicles(data.vehicles ?? [], listings, seen);
      } catch {
        break;
      }
      await delay(400);
    }
  } finally {
    await closeBrowserSession(session);
  }
  return added;
}

function modelKey(t: { make: string; model: string }): string {
  return `${t.make} ${t.model}`;
}

/** Models currently below MIN_PER_MODEL, most-deficient first (so a scarce
 *  top-up budget is spent where it matters most). */
function findLowModels(listings: Listing[]): { make: string; model: string }[] {
  const counts = new Map<string, number>();
  for (const t of MODEL_TARGETS) counts.set(modelKey(t), 0);
  for (const l of listings) counts.set(modelKey(l), (counts.get(modelKey(l)) ?? 0) + 1);
  return MODEL_TARGETS.filter((t) => (counts.get(modelKey(t)) ?? 0) < MIN_PER_MODEL).sort(
    (a, b) => (counts.get(modelKey(a)) ?? 0) - (counts.get(modelKey(b)) ?? 0)
  );
}

/**
 * The combined query's cross-model sort is NOT proportional — verified live,
 * repeatably: Toyota/Honda/Hyundai models consistently land 15-40 listings
 * within the WAF-limited page window while Mazda/Subaru models get 2-4, even
 * though every model is included in every request. Worse, that same skew
 * reappears even inside a *combined* top-up request scoped to just the
 * leftover models (verified live: one shared request for Tucson + Mazda3 +
 * Forester + Crosstrek still let Tucson eat most of the page, leaving the
 * other three untouched) — a shared page never reliably helps the smallest
 * models. So this issues one SINGLE-MODEL request per under-represented
 * model instead, most-deficient first: naming only one model in the query
 * gives it the entire page to itself, so any real inventory for it shows up
 * regardless of how it'd otherwise sort against higher-volume makes. Each
 * model costs its own request against the tiny WAF budget, so the loop stops
 * at the first bare-fetch block rather than burning the rest of the budget on
 * requests that would fail the same way, then falls back to one browser
 * session (if available) to mop up whatever's still short. Returns how many
 * models were identified as under-represented.
 */
async function topUpUnderrepresentedModels(
  listings: Listing[],
  seen: Set<string>,
  deadline: number,
  requestTimeoutMs: number,
  jsFallbackEnabled: boolean,
  log: LogFn
): Promise<number> {
  const initiallyLow = findLowModels(listings);
  if (initiallyLow.length === 0 || Date.now() >= deadline) return 0;

  log(
    "info",
    `Clutch.ca: topping up ${initiallyLow.length} under-represented model(s) one request each (${initiallyLow
      .map((t) => t.model)
      .join(", ")})…`
  );

  for (const t of initiallyLow) {
    if (Date.now() >= deadline) break;
    let data: ClutchPage | null;
    try {
      data = await fetchPageAt(buildModelsQueryUrl([t], 0), requestTimeoutMs);
    } catch {
      data = null;
    }
    if (!data) break; // bare fetch just got blocked — further bare requests would too
    ingestVehicles(data.vehicles ?? [], listings, seen);
  }

  const stillLow = findLowModels(listings);
  if (stillLow.length > 0 && jsFallbackEnabled && Date.now() < deadline) {
    log("info", `Clutch.ca: bare-fetch top-up blocked or incomplete — trying a browser session for ${stillLow.length} still-low model(s)…`);
    const session = await openBrowserSession("https://www.clutch.ca/cars", log);
    if (!session) log("warn", "Clutch.ca: browser session unavailable for top-up — keeping bare-fetch results as-is");
    if (session) {
      try {
        for (const t of stillLow) {
          if (Date.now() >= deadline) break;
          const text = await fetchJsonInSession(session, buildModelsQueryUrl([t], 0));
          if (!text) break; // the session itself is blocked — stop
          try {
            ingestVehicles((JSON.parse(text) as ClutchPage).vehicles ?? [], listings, seen);
          } catch {
            /* malformed — skip */
          }
        }
      } finally {
        await closeBrowserSession(session);
      }
    }
  }

  return initiallyLow.length;
}

export const clutch: Scraper = {
  key: "clutch",
  source: "Clutch.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    const maxPages = Math.max(1, cfg.clutchMaxPages);
    const deadline = Date.now() + cfg.sourceTimeoutMs - 5000;
    const listings: Listing[] = [];
    const seen = new Set<string>();

    log("info", `Clutch.ca: querying all ${MODEL_TARGETS.length} models in one combined request…`);

    // Bare-fetch pagination until the WAF challenges (a null page after page 0),
    // the page cap, the last real page, or the deadline.
    let page = 0;
    let totalPages = 1;
    for (; page < maxPages && Date.now() < deadline; page++) {
      let data: ClutchPage | null;
      try {
        data = await fetchPage(page, cfg.requestTimeoutMs);
      } catch (e) {
        log("warn", `Clutch.ca: page ${page} failed — ${(e as Error).message.slice(0, 80)}`);
        data = null;
      }
      if (!data) break; // WAF-challenged (or unreachable) — keep whatever's collected so far
      totalPages = data.totalPages ?? totalPages;
      ingestVehicles(data.vehicles ?? [], listings, seen);
      if (page + 1 >= totalPages) {
        page += 1; // consumed the last real page
        break;
      }
      await delay(400);
    }

    if (shouldContinueViaBrowser(page, totalPages, cfg.jsFallbackEnabled)) {
      await continueViaBrowser(page, totalPages, listings, seen, deadline, log);
    }

    // The combined query's cross-model sort favours certain makes — guarantee
    // every model has a real, usable sample rather than whatever the sort
    // happened to surface within the page budget.
    await topUpUnderrepresentedModels(listings, seen, deadline, cfg.requestTimeoutMs, cfg.jsFallbackEnabled, log);

    const models = new Set(listings.map((l) => `${l.make} ${l.model}`));
    const ok = listings.length > 0;
    const note = listings.length
      ? `${listings.length} listing(s) across ${models.size}/${MODEL_TARGETS.length} models`
      : "Clutch API unreachable — skipped";
    log(ok ? "info" : "warn", `Clutch.ca: ${note}`);
    return { key: "clutch", source: "Clutch.ca", listings, ok, note };
  },
};
