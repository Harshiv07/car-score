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

export async function getScoredListings(): Promise<ScoredListing[]> {
  const storage = await getStorage();
  const all = await storage.getAllListings();
  const scored: ScoredListing[] = [];
  for (const l of all) {
    const score = scoreListing(l, all);
    if (score) scored.push({ ...l, score, badges: [] });
  }
  assignBadges(scored);
  return scored;
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
