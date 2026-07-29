/**
 * Read-side service: scores listings, applies filters and sorting, assigns
 * leaderboard badges. Scoring runs at read time because the Market Value
 * category depends on the *current* set of comparable listings.
 */

import { Listing, ListingFilters, ScoredListing, SortKey } from "../types";
import { getStorage } from "../db/storage";
import { scoreListing } from "../scoring/engine";
import { getModelInfo } from "../data/vehicleModels";

function getCat(l: ScoredListing, key: string): number {
  return l.score.breakdown.find((c) => c.key === key)?.points ?? 0;
}

/**
 * Scoring cache.
 *
 * Market Value scores each listing against the current comparable set, so
 * scoring the inventory is O(n²) — at ~1,200 listings that was ~120ms of pure
 * CPU on *every* request, including single-listing detail views, and it grows
 * quadratically with the crawler's reach. Reading the raw listings is cheap;
 * only the scoring is not. So we fingerprint the raw set (O(n)) and reuse the
 * scored result until the inventory actually changes.
 */
let scoreCache: { fingerprint: string; scored: ScoredListing[]; builtAt: number } | null = null;

/**
 * How long a built cache is trusted without re-reading the inventory.
 *
 * The fingerprint above made scoring cheap but left the *read* on every
 * request: `getAllListings()` pulls the whole collection out of MongoDB just to
 * confirm nothing changed. Measured against production at 1,376 listings that
 * was the dominant cost — `/api/listings` took ~1.5s warm, of which roughly
 * 800ms was fetching ~3 MB from Atlas to compute a hash and throw it away.
 *
 * Inventory only changes when a crawl writes, and a crawl is rate-limited to
 * one per ten minutes and calls `invalidateScoreCache()` when it finishes. So
 * within this window a request needs no database round trip at all, and the
 * fingerprint still guards correctness the moment the window lapses.
 */
const CACHE_TTL_MS = 30_000;

/** Cheap, order-independent signature of the inventory's scoring inputs. */
function fingerprint(listings: Listing[]): string {
  let hash = 0;
  let newest = 0;
  for (const l of listings) {
    // Only fields the scoring engine reads can change a score.
    const s = `${l.id}|${l.price}|${l.mileageKm}|${l.year}|${l.cpo}`;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    const seen = Date.parse(l.lastSeenAt ?? "") || 0;
    if (seen > newest) newest = seen;
  }
  return `${listings.length}:${hash}:${newest}`;
}

export async function getScoredListings(): Promise<ScoredListing[]> {
  // Inside the TTL, serve without touching the database at all.
  if (scoreCache && Date.now() - scoreCache.builtAt < CACHE_TTL_MS) return scoreCache.scored;

  const storage = await getStorage();
  const all = await storage.getAllListings();

  const fp = fingerprint(all);
  if (scoreCache && scoreCache.fingerprint === fp) {
    // Inventory is unchanged: keep the scores, restart the window.
    scoreCache.builtAt = Date.now();
    return scoreCache.scored;
  }

  const scored: ScoredListing[] = [];
  for (const l of all) {
    const score = scoreListing(l, all);
    if (score) scored.push({ ...l, score, badges: [] });
  }
  assignBadges(scored);

  scoreCache = { fingerprint: fp, scored, builtAt: Date.now() };
  return scored;
}

/** Drop the cache — called after a scrape writes new inventory. */
export function invalidateScoreCache(): void {
  scoreCache = null;
}

/**
 * Inventory-wide aggregates for the leaderboard header.
 *
 * These have to be computed over the *whole* inventory. The client used to
 * derive them from `?pageSize=100&sort=deal`, so "average score" was the average
 * of the best 100 cars and "sources active" counted only the sources those 100
 * happened to come from — which is why a four-source inventory reported one.
 */
export function inventoryStats(scored: ScoredListing[]) {
  const best = scored.reduce<ScoredListing | null>(
    (b, l) => (l.score.market.savings > (b?.score.market.savings ?? -Infinity) ? l : b),
    null
  );
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, l) => s + l.score.total, 0) / scored.length)
    : 0;

  return {
    totalListings: scored.length,
    avgScore,
    sourcesActive: new Set(scored.map((l) => l.sourceWebsite)).size,
    dealerCount: new Set(scored.map((l) => l.dealer).filter(Boolean)).size,
    excellentDeals: scored.filter((l) => l.score.dealRating === "Excellent Deal").length,
    bestSavings: best && best.score.market.savings > 0 ? Math.round(best.score.market.savings) : 0,
    bestSavingsTitle: best?.title ?? null,
    bestSavingsId: best?.id ?? null,
    withPhoto: scored.filter((l) => !!l.image).length,
  };
}

/** Badges are relative to the full current inventory, not the filtered view. */
function assignBadges(listings: ScoredListing[]): void {
  if (listings.length === 0) return;

  for (const l of listings) {
    if (l.score.dealRating === "Excellent Deal") l.badges.push("Excellent Deal");
  }
  const by = (fn: (l: ScoredListing) => number, dir: 1 | -1) =>
    [...listings].sort((a, b) => dir * (fn(b) - fn(a)));

  const bestReliability = by((l) => getCat(l, "reliability"), 1)[0];
  const bestWinter = by((l) => getCat(l, "winter"), 1)[0];
  const bestResale = by((l) => getCat(l, "resale"), 1)[0];
  const withKm = listings.filter((l) => l.mileageKm != null);
  const lowestKm = withKm.length
    ? withKm.reduce((min, l) => ((l.mileageKm as number) < (min.mileageKm as number) ? l : min))
    : null;

  // Tag every listing tied with the top value so equal cars are treated equally.
  for (const l of listings) {
    if (getCat(l, "reliability") === getCat(bestReliability, "reliability")) l.badges.push("Best Reliability");
    if (getCat(l, "winter") === getCat(bestWinter, "winter")) l.badges.push("Best Winter");
    if (getCat(l, "resale") === getCat(bestResale, "resale")) l.badges.push("Best Resale");
  }
  if (lowestKm) lowestKm.badges.push("Lowest Mileage");
}

export function applyFilters(listings: ScoredListing[], f: ListingFilters): ScoredListing[] {
  return listings.filter((l) => {
    if (f.priceMin != null && l.price < f.priceMin) return false;
    if (f.priceMax != null && l.price > f.priceMax) return false;
    if (f.yearMin != null && l.year < f.yearMin) return false;
    if (f.yearMax != null && l.year > f.yearMax) return false;
    if (f.mileageMax != null && (l.mileageKm == null || l.mileageKm > f.mileageMax)) return false;
    if (f.make && l.make.toLowerCase() !== f.make.toLowerCase()) return false;
    if (f.model && l.model.toLowerCase() !== f.model.toLowerCase()) return false;
    if (f.province && (l.province ?? "").toLowerCase() !== f.province.toLowerCase()) return false;
    if (f.city && (l.city ?? "").toLowerCase() !== f.city.toLowerCase()) return false;
    if (f.drivetrain && l.drivetrain !== f.drivetrain) return false;
    if (f.fuelType && l.fuelType !== f.fuelType) return false;
    if (f.cpoOnly && !l.cpo) return false;
    if (f.dealerOnly && !l.isDealer) return false;
    if (f.sourceWebsite && l.sourceWebsite !== f.sourceWebsite) return false;
    if (f.scoreMin != null && l.score.total < f.scoreMin) return false;
    if (f.scoreMax != null && l.score.total > f.scoreMax) return false;
    return true;
  });
}

export function sortListings(listings: ScoredListing[], sort: SortKey): ScoredListing[] {
  const s = [...listings];
  switch (sort) {
    case "score":
      return s.sort((a, b) => b.score.total - a.score.total);
    case "deal":
      return s.sort((a, b) => b.score.market.savings - a.score.market.savings);
    case "mileage":
      return s.sort((a, b) => (a.mileageKm ?? Infinity) - (b.mileageKm ?? Infinity));
    case "price":
      return s.sort((a, b) => a.price - b.price);
    case "reliability":
      return s.sort((a, b) => getCat(b, "reliability") - getCat(a, "reliability"));
    case "newest":
      return s.sort((a, b) => b.year - a.year);
    case "resale":
      return s.sort((a, b) => getCat(b, "resale") - getCat(a, "resale"));
    default:
      return s.sort((a, b) => b.score.total - a.score.total);
  }
}

/** Up to `n` alternative listings near the given one: same body class or model, closest score. */
export function findAlternatives(listing: ScoredListing, all: ScoredListing[], n = 4): ScoredListing[] {
  const info = getModelInfo(listing.make, listing.model);
  return all
    .filter((l) => l.id !== listing.id)
    .map((l) => {
      const li = getModelInfo(l.make, l.model);
      const sameModel = l.model === listing.model && l.make === listing.make;
      const sameBody = info && li && li.body === info.body;
      const affinity = (sameModel ? 2 : 0) + (sameBody ? 1 : 0);
      const priceDist = Math.abs(l.price - listing.price) / Math.max(listing.price, 1);
      return { l, rank: affinity * 10 - priceDist * 5 + l.score.total / 20 };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, n)
    .map((x) => x.l);
}

/** Rough annual ownership estimate for the detail page. */
export function ownershipEstimate(listing: Listing) {
  const info = getModelInfo(listing.make, listing.model);
  if (!info) return null;
  const kmPerYear = 16000;
  const fuelPrice = 1.6; // CAD/L
  const fuelAnnual = Math.round((info.ownership.fuelCombLper100km / 100) * kmPerYear * fuelPrice);
  const insuranceAnnual = Math.round(2600 - info.ownership.insuranceTier * 220); // tier 5 → ~$1500, tier 1 → ~$2400
  const maintenanceAnnual = info.ownership.maintAnnualCad;
  return {
    assumptions: { kmPerYear, fuelPriceCadPerL: fuelPrice },
    fuelAnnual,
    insuranceAnnual,
    maintenanceAnnual,
    totalAnnual: fuelAnnual + insuranceAnnual + maintenanceAnnual,
  };
}
