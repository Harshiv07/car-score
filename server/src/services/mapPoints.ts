import { ScoredListing } from "../types";

/** One dot on the market map: just enough to place, colour and label a car. */
export interface MapPoint {
  id: string;
  /** price (CAD) */
  p: number;
  /** odometer in km */
  k: number;
  /** total score, rounded */
  s: number;
  /** "2021 Mazda CX-5" */
  t: string;
  /** asking price minus market value (negative = under market) */
  d: number;
}

/** Upper bound so a request can't ask for the whole of a very large inventory. */
export const MAP_POINT_LIMIT = 1500;

/**
 * Compact projection of the inventory for the price-vs-mileage map. A full
 * scored listing is ~2.5 KB; a point is ~70 bytes, so the whole map costs less
 * than one page of the list. Cars without an odometer reading can't be placed.
 * When there are more than the limit, the best-scored are kept.
 */
export function mapPoints(listings: ScoredListing[], limit = MAP_POINT_LIMIT): MapPoint[] {
  const placed = listings.filter((l) => l.mileageKm != null && l.price > 0);
  const kept =
    placed.length > limit ? [...placed].sort((a, b) => b.score.total - a.score.total).slice(0, limit) : placed;
  return kept.map((l) => ({
    id: l.id,
    p: l.price,
    k: l.mileageKm as number,
    s: Math.round(l.score.total),
    t: `${l.year} ${l.make} ${l.model}`,
    d: Math.round(l.price - l.score.market.marketPrice),
  }));
}
