/**
 * Clutch.ca — online used-car retailer, scraped through its public JSON API
 * (api.clutch.ca). Browser-free: it returns fully structured vehicles (year,
 * make, model, trim, mileage, drivetrain, fuel, province price), so it works on
 * hosts without Chromium (Render, etc.).
 *
 * The constraint that shapes everything here: api.clutch.ca sits behind AWS
 * WAF that allows only a tiny per-run request budget before returning an empty
 * HTTP 202 challenge (verified live: ~3-4 requests on Render's flagged
 * datacenter IP; slowing the pacing doesn't help — 400ms vs 3000ms made no
 * difference, it's a request-COUNT budget, not a rate limit — and the budget
 * is shared across bare fetches AND in-browser fetches from the same IP). So
 * the whole design is about spending those ~3-4 requests where they buy the
 * most COVERAGE, in three phases:
 *
 *   Phase 1 (breadth): ONE combined request listing all 5 makes + 10 models
 *   (`makes[]`×5, `models[]`×10). The API returns a MIX of all models on the
 *   page, so a single request seeds every model at once. It does NOT paginate
 *   deeper by default — the combined query's cross-model sort is NOT
 *   proportional (verified live, repeatably: Toyota/Honda/Hyundai land 15-40
 *   while Mazda/Subaru get 2-4), so deeper pages just re-surface the
 *   already-plentiful high-volume models and waste the budget.
 *
 *   Phase 2 (rare-model fill): the rest of the fresh budget goes to
 *   SINGLE-MODEL queries for the models Phase 1 left under MIN_PER_MODEL,
 *   MOST-DEFICIENT FIRST. Naming one model gives it the whole page to itself,
 *   and one page returns that model's complete inventory up to the API's 32
 *   (verified live: Forester 13/13). Rarest-first is what makes the scarce
 *   budget land on Forester/Crosstrek/Mazda3 before it's spent. This is the
 *   fix for the long-standing "some models barely fetched" complaint.
 *
 *   Phase 3 (browser bonus): only productive on a host with a real browser AND
 *   an unflagged IP (local dev) — a no-op on Render, verified live ("Chromium
 *   is not installed" before the Docker migration; the WAF challenge unsolved
 *   after it). One reused browser session runs three escalating sub-tiers:
 *   deeper combined pages, per-model in-page fetch(), then per-model
 *   product-page navigation (reads clutch.ca/cars/{slug} DOM cards — same
 *   underlying api.clutch.ca data, but a full page load is a different request
 *   pattern than an injected fetch, verified to sometimes land where the other
 *   two were blocked).
 */

import type { Page } from "playwright";
import { Listing } from "../types";
import { matchModelFromTitle, VEHICLE_MODELS } from "../data/vehicleModels";
import { normalizeRecord } from "./normalize";
import { LogFn, RawVehicleRecord, Scraper, ScraperRunResult } from "./types";
import { BROWSER_HEADERS, fetchWithTimeout, loadScrapeConfig } from "./config";
import { BrowserSession, closeBrowserSession, fetchJsonInSession, openBrowserSession } from "./crawl";

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
  //
  // Null, not a generic /cars link, when the payload has no id. The listing URL
  // is now part of a listing's identity (util/listingKeys.ts), so handing every
  // id-less vehicle the same URL would make them all the same record and
  // collapse a whole model's inventory into one row. Without an id we genuinely
  // don't have this car's page, and saying so lets the composite key take over.
  const url = v.id != null ? `https://www.clutch.ca/vehicles/${v.id}` : null;
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

/** clutch.ca's own per-model product page slug — verified against every
 *  model this app tracks (e.g. "Honda CR-V" → "honda-cr-v", "Mazda Mazda3" →
 *  "mazda-mazda3"): lowercase make + "-" + lowercase model, no other changes. */
export function productPageSlug(t: { make: string; model: string }): string {
  return `${t.make.toLowerCase()}-${t.model.toLowerCase()}`;
}

/** Page 1 has no `page` param; page 2+ adds `?page=N` — matches clutch.ca's
 *  own URLs exactly (e.g. clutch.ca/cars/hyundai-tucson?page=2). */
export function productPageUrl(t: { make: string; model: string }, page: number): string {
  const base = `https://www.clutch.ca/cars/${productPageSlug(t)}`;
  return page > 1 ? `${base}?page=${page}` : base;
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
 * Phase 3 — browser bonus tiers. Only genuinely productive on a host with a
 * real browser AND an unflagged IP (local dev): on Render's datacenter IP the
 * AWS WAF won't let a headless browser solve its post-budget challenge, so
 * every tier here no-ops (verified live — all three logged "blocked or
 * incomplete" and added nothing). All three reuse ONE browser session, i.e.
 * ONE Chromium launch — the earlier design launched a second browser for the
 * top-up tiers, and two concurrent launches risked an OOM on Render's
 * memory-limited free instance. The tiers, in escalating order:
 *   1. continue the combined query's deeper pages (high-volume depth), the
 *      in-page fetch inheriting the browser's solved challenge;
 *   2. per-model in-page fetch() for models still under MIN_PER_MODEL;
 *   3. per-model product-page navigation for whatever's STILL short — reads
 *      the rendered DOM cards, a different request pattern than an injected
 *      fetch (verified live to sometimes land where 1 and 2 were blocked).
 */
async function browserBonusTiers(
  combinedNextPage: number,
  totalPages: number,
  listings: Listing[],
  seen: Set<string>,
  deadline: number,
  log: LogFn
): Promise<void> {
  if (Date.now() >= deadline) return;
  const session = await openBrowserSession("https://www.clutch.ca/cars", log);
  if (!session) {
    log("warn", "Clutch.ca: no browser on this host — skipping browser bonus tiers (expected on Render)");
    return;
  }
  try {
    // Tier 1: deeper combined pages. totalPages may still be the unknown-
    // default (1) if bare fetch never got a page back (page 0 itself blocked);
    // the real bound is re-derived below from the browser's own first page.
    if (shouldContinueViaBrowser(combinedNextPage, totalPages, true)) {
      log("info", `Clutch.ca: browser session — continuing combined pagination (page ${combinedNextPage}+)…`);
      let lastPage = Math.min(totalPages || ABSOLUTE_MAX_PAGES, ABSOLUTE_MAX_PAGES);
      for (let page = combinedNextPage; page < lastPage && Date.now() < deadline; page++) {
        const text = await fetchJsonInSession(session, buildAllModelsQueryUrl(page));
        if (!text) break; // browser is blocked too — stop
        try {
          const data = JSON.parse(text) as ClutchPage;
          if (data.totalPages) lastPage = Math.min(data.totalPages, ABSOLUTE_MAX_PAGES);
          ingestVehicles(data.vehicles ?? [], listings, seen);
        } catch {
          break;
        }
        await delay(400);
      }
    }

    // Tier 2: per-model in-page fetch for models still under MIN_PER_MODEL.
    let low = findLowModels(listings);
    if (low.length > 0 && Date.now() < deadline) {
      log("info", `Clutch.ca: browser session — in-page fetch for ${low.length} still-low model(s)…`);
      for (const t of low) {
        if (Date.now() >= deadline) break;
        const text = await fetchJsonInSession(session, buildModelsQueryUrl([t], 0));
        if (!text) break; // the session itself is blocked — stop
        try {
          ingestVehicles((JSON.parse(text) as ClutchPage).vehicles ?? [], listings, seen);
        } catch {
          /* malformed — skip */
        }
      }
    }

    // Tier 3: product-page navigation for whatever's STILL short.
    low = findLowModels(listings);
    if (low.length > 0 && Date.now() < deadline) {
      log("info", `Clutch.ca: browser session — reading product pages for ${low.length} still-low model(s)…`);
      await topUpViaProductPageNavigation(session, low, listings, seen, deadline, log);
    }
  } finally {
    await closeBrowserSession(session);
  }
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

export interface ProductCard {
  href: string;
  /** Every leaf (childless) element's trimmed text, in DOM order. Reading it
   *  this way instead of by CSS selector is deliberate: clutch.ca's markup is
   *  MUI-generated with hashed class names (e.g. "css-15krxls") that can
   *  change on any of their deploys, but the leaf-by-leaf text content — a
   *  badge, "2022 Hyundai Elantra", a trim, "•", "40,410 km", "$20,290", the
   *  biweekly/down-payment/shipping/legal lines — is stable and verified
   *  live across 32 real cards, including sale (two price leaves), no-trim,
   *  and "N+ views today" badge variants. */
  leaves: string[];
}

// Evaluated in the browser page as a plain string, not passed as a function
// reference: tsx/esbuild injects a `__name(...)` wrapper around nested named
// functions to preserve `.name`, and Playwright's function-serialization
// sends that compiled source as-is — `__name` doesn't exist in the isolated
// page context, so the nested `function leafTexts(){}` below threw
// "ReferenceError: __name is not defined" the moment it ran in-page
// (verified live). A string body sidesteps the transform entirely.
const EXTRACT_PRODUCT_CARDS_JS = `(() => {
  function leafTexts(el) {
    var out = [];
    function walk(node) {
      if (node.children.length === 0) {
        var t = (node.textContent || "").trim();
        if (t) out.push(t);
      } else {
        Array.prototype.forEach.call(node.children, walk);
      }
    }
    walk(el);
    return out;
  }
  return Array.prototype.slice.call(document.querySelectorAll('a[href*="/vehicles/"]')).map(function (a) {
    return { href: a.getAttribute("href") || "", leaves: leafTexts(a) };
  });
})()`;

/** Runs inside the browser page: reads every vehicle card (an `<a
 *  href="/vehicles/{id}">` wrapping the whole tile) into its leaf texts. */
async function extractProductCards(page: Page): Promise<ProductCard[]> {
  return page.evaluate(EXTRACT_PRODUCT_CARDS_JS);
}

/**
 * Parse one card's leaves into a raw vehicle record. make/model come from the
 * calling context (the product page is already scoped to one model) rather
 * than being parsed out of "2022 Hyundai Elantra"-style text, which would be
 * ambiguous for multi-word makes/models. Verified live against 32 real Elantra
 * cards: year is always the first leaf starting with a plausible year (never
 * collides with mileage/price leaves, which start with digits-then-comma or
 * "$"); the first "$N,NNN" leaf is the current price even on sale listings,
 * where a second (strikethrough original) price leaf follows it; trim is
 * whatever leaf comes right after the year, skipping badge leaves ("Compare",
 * "Sale", "favorite", "N+ views today") — or null if the card has none.
 */
export function parseProductCard(card: ProductCard, target: { make: string; model: string }): RawVehicleRecord | null {
  const yearLeaf = card.leaves.find((l) => /^(19|20)\d{2}\b/.test(l));
  if (!yearLeaf) return null;
  const year = Number(yearLeaf.slice(0, 4));
  const kmLeaf = card.leaves.find((l) => /^[\d,]+\s*km$/i.test(l));
  const km = kmLeaf ? Number(kmLeaf.replace(/[^\d]/g, "")) : null;
  const priceLeaf = card.leaves.find((l) => /^\$[\d,]+$/.test(l));
  const price = priceLeaf ? Number(priceLeaf.replace(/[^\d]/g, "")) : null;

  let trim: string | null = null;
  for (let i = card.leaves.indexOf(yearLeaf) + 1; i < card.leaves.length; i++) {
    const l = card.leaves[i];
    if (l === "•") break;
    if (l !== "Compare" && l !== "Sale" && l !== "favorite" && !/views today$/.test(l)) {
      trim = l;
      break;
    }
  }

  const idMatch = card.href.match(/\/vehicles\/(\d+)/);
  const url = idMatch ? `https://www.clutch.ca/vehicles/${idMatch[1]}` : card.href ? `https://www.clutch.ca${card.href}` : null;
  if (!url) return null;

  return {
    title: [year, target.make, target.model, trim].filter(Boolean).join(" "),
    make: target.make,
    model: target.model,
    trim,
    year,
    price,
    km,
    drivetrain: null,
    fuel: null,
    url,
    image: null,
  };
}

/**
 * Last-resort top-up tier: navigate a real browser to the model's own product
 * page (clutch.ca/cars/{slug}) and read the rendered vehicle cards straight
 * from the DOM, instead of calling the API. Important honesty check: this is
 * NOT an independently-blockable data source — the product page populates
 * itself by making the exact same api.clutch.ca call internally, so if that
 * call is blocked the page shows no cards either. What's genuinely different
 * is the request pattern: a full page navigation (loading the real JS bundle,
 * running the site's own bootstrap) versus this file's other tiers, which
 * inject a fetch() into an already-loaded page. Whether that distinction ever
 * matters to the WAF is untested — this exists to give it a real chance
 * rather than assume either way. Reuses the given session; stops at the first
 * model whose page renders no cards (further navigations would likely fail
 * the same way).
 */
async function topUpViaProductPageNavigation(
  session: BrowserSession,
  targets: { make: string; model: string }[],
  listings: Listing[],
  seen: Set<string>,
  deadline: number,
  log: LogFn
): Promise<number> {
  let added = 0;
  for (const t of targets) {
    if (Date.now() >= deadline) break;
    let cards: ProductCard[];
    try {
      await session.page.goto(productPageUrl(t, 1), { waitUntil: "domcontentloaded", timeout: 20000 });
      await session.page.waitForTimeout(1500);
      cards = await extractProductCards(session.page);
    } catch (e) {
      log("warn", `Clutch.ca: product-page navigation failed for ${t.model} — ${(e as Error).message.slice(0, 80)}`);
      break;
    }
    if (cards.length === 0) break; // no cards rendered — blocked or empty, further models would fail too
    for (const card of cards) {
      const raw = parseProductCard(card, t);
      if (!raw) continue;
      const listing = normalizeRecord(raw, {
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
    await delay(400);
  }
  return added;
}

/**
 * Phase 2 — spend the remaining bare-fetch WAF budget on the models Phase 1
 * (the single combined page) left under MIN_PER_MODEL, MOST-DEFICIENT FIRST,
 * one single-model request each. This is the heart of covering the rare
 * models. The combined query's cross-model sort is NOT proportional (verified
 * live, repeatably: Toyota/Honda/Hyundai land 15-40 while Mazda/Subaru get
 * 2-4), and that same skew reappears even inside a *combined* request scoped
 * to just the leftover models (a shared page lets one model eat most of it).
 * So each thin model gets its OWN request: naming a single model gives it the
 * whole page to itself, and one page already returns that model's complete
 * inventory up to the API's 32 (verified live: Forester 13/13). Rarest-first
 * ordering is what makes this work on a flagged datacenter IP, where the
 * WAF's per-IP budget (shared across every request this run) is only ~3-4 —
 * the scarcest models must claim it before it's spent. Stops at the first
 * blocked/failed request; later ones would fail identically.
 */
async function fillLowModelsBareFetch(
  listings: Listing[],
  seen: Set<string>,
  deadline: number,
  requestTimeoutMs: number,
  log: LogFn
): Promise<void> {
  const low = findLowModels(listings);
  if (low.length === 0 || Date.now() >= deadline) return;

  log(
    "info",
    `Clutch.ca: filling ${low.length} under-represented model(s) rarest-first, one request each (${low
      .map((t) => t.model)
      .join(", ")})…`
  );

  for (const t of low) {
    if (Date.now() >= deadline) break;
    let data: ClutchPage | null;
    try {
      data = await fetchPageAt(buildModelsQueryUrl([t], 0), requestTimeoutMs);
    } catch {
      data = null;
    }
    if (!data) break; // shared WAF budget spent / blocked — later requests would fail too
    ingestVehicles(data.vehicles ?? [], listings, seen);
    await delay(400);
  }
}

export const clutch: Scraper = {
  key: "clutch",
  source: "Clutch.ca",
  async run(log: LogFn): Promise<ScraperRunResult> {
    const cfg = loadScrapeConfig();
    const maxCombinedPages = Math.max(1, cfg.clutchMaxPages);
    const deadline = Date.now() + cfg.sourceTimeoutMs - 5000;
    const listings: Listing[] = [];
    const seen = new Set<string>();

    log("info", `Clutch.ca: querying all ${MODEL_TARGETS.length} models in one combined request for breadth…`);

    // Phase 1 — breadth: the combined all-models query (default just page 0).
    // On a flagged datacenter IP the WAF's whole per-run budget is only ~3-4
    // requests, so this deliberately does NOT spend it on deeper combined
    // pages — their skewed sort just re-surfaces the already-plentiful
    // high-volume models. That budget is worth far more in Phase 2.
    let page = 0;
    let totalPages = 1;
    for (; page < maxCombinedPages && Date.now() < deadline; page++) {
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

    // Phase 2 — targeted fill: the rest of the still-fresh bare-fetch budget
    // goes to single-model queries for the models Phase 1 left thin, rarest
    // first. This runs BEFORE any browser work so it claims the shared WAF
    // budget while it's unspent (the browser tiers share that same budget and,
    // on a flagged IP, would only waste it on requests that can't clear the
    // challenge anyway).
    await fillLowModelsBareFetch(listings, seen, deadline, cfg.requestTimeoutMs, log);

    // Phase 3 — browser bonus (local dev / unflagged IPs only; a no-op on
    // Render, verified live). Deep combined pages + per-model in-page fetch +
    // product-page reads, all on one reused session.
    if (cfg.jsFallbackEnabled && findLowModels(listings).length > 0 && Date.now() < deadline) {
      await browserBonusTiers(page, totalPages, listings, seen, deadline, log);
    }

    const models = new Set(listings.map((l) => `${l.make} ${l.model}`));
    const ok = listings.length > 0;
    const note = listings.length
      ? `${listings.length} listing(s) across ${models.size}/${MODEL_TARGETS.length} models`
      : "Clutch API unreachable — skipped";
    log(ok ? "info" : "warn", `Clutch.ca: ${note}`);
    return { key: "clutch", source: "Clutch.ca", listings, ok, note };
  },
};
