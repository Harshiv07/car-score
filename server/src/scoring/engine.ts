/**
 * CarScore V2 hybrid scoring engine — 100 points, fully explainable.
 *
 *   1. Reliability          20   model knowledge base (CR/RepairPal/engine/trans)
 *   2. Market Value         20   listing price vs market (comparables or baseline)
 *   3. Total Ownership Cost 15   fuel + insurance + maintenance + repairs + parts
 *   4. Winter Capability    10   AWD + clearance + winter reliability + traction
 *   5. Safety               10   IIHS/NHTSA + driver-assist features on the car
 *   6. Mileage              10   actual vs expected mileage for its age
 *   7. Resale Value          5   brand/model value retention
 *   8. Recalls/Known Issues  5   open-recall risk + costly pattern failures
 *   9. CPO / Warranty        3   CPO status + remaining warranty
 *  10. Desirable Features    2   heated seats, remote start, CarPlay, ...
 *
 * Every category returns points, a 0–5 star rating and a human-readable
 * `detail` string so the UI can show *why* a car ranks where it does.
 */

import { Listing, MarketComparison, DealRating, ScoreCategory, ScoreResult } from "../types";
import { VehicleModelInfo, getModelInfo } from "../data/vehicleModels";

const CURRENT_YEAR = new Date().getFullYear();

const cad = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const stars = (points: number, max: number) => Math.round((points / max) * 5 * 2) / 2;

/* ------------------------------------------------------------------ */
/* Market price                                                        */
/* ------------------------------------------------------------------ */

/**
 * Estimate the market price for a listing.
 * Preferred: average of comparable listings in the DB (same model, ±1 model
 * year, at least 3 samples, excluding the listing itself), adjusted for the
 * km difference vs the comparable average.
 * Fallback: the model's anchored depreciation curve.
 */
export function estimateMarketPrice(
  listing: Listing,
  info: VehicleModelInfo,
  allListings: Listing[]
): MarketComparison {
  const comps = allListings.filter(
    (l) =>
      l.id !== listing.id &&
      l.make === listing.make &&
      l.model === listing.model &&
      Math.abs(l.year - listing.year) <= 1 &&
      l.price > 1000
  );

  if (comps.length >= 3) {
    const avgPrice = comps.reduce((s, l) => s + l.price, 0) / comps.length;
    const withKm = comps.filter((l) => l.mileageKm != null);
    let kmAdj = 0;
    if (listing.mileageKm != null && withKm.length >= 3) {
      const avgKm = withKm.reduce((s, l) => s + (l.mileageKm as number), 0) / withKm.length;
      // ~2.5% of value per 10,000 km away from the comparable average
      kmAdj = ((avgKm - listing.mileageKm) / 10000) * 0.025 * avgPrice;
    }
    const marketPrice = Math.round(avgPrice + clamp(kmAdj, -0.15 * avgPrice, 0.15 * avgPrice));
    return {
      marketPrice,
      listingPrice: listing.price,
      savings: Math.round(marketPrice - listing.price),
      sampleSize: comps.length,
      method: "comparables",
    };
  }

  // Baseline: anchored depreciation curve, adjusted for mileage vs expected.
  const { anchorYear, anchorPriceCad, annualDepreciation } = info.market;
  // Newer than the anchor year → above the anchor price, older → below.
  let base = anchorPriceCad * Math.pow(1 - annualDepreciation, anchorYear - listing.year);
  if (listing.mileageKm != null) {
    const age = Math.max(1, CURRENT_YEAR - listing.year);
    const expectedKm = age * info.expectedKmPerYear;
    const kmDelta = expectedKm - listing.mileageKm;
    base += clamp(((kmDelta / 10000) * 0.025) * base, -0.15 * base, 0.15 * base);
  }
  const marketPrice = Math.round(base);
  return {
    marketPrice,
    listingPrice: listing.price,
    savings: Math.round(marketPrice - listing.price),
    sampleSize: 0,
    method: "baseline",
  };
}

function dealRating(market: MarketComparison): DealRating {
  const pct = market.savings / market.marketPrice;
  if (pct >= 0.1) return "Excellent Deal";
  if (pct >= 0.05) return "Great Deal";
  if (pct >= 0.02) return "Good Deal";
  if (pct >= -0.03) return "Fair Price";
  if (pct >= -0.08) return "Above Market";
  return "Overpriced";
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

function scoreReliability(info: VehicleModelInfo): ScoreCategory {
  const raw =
    info.reliability.consumerReports * 0.3 +
    info.reliability.repairPal * 0.2 +
    info.reliability.engine * 0.3 +
    info.reliability.transmission * 0.2; // 0-5
  const points = Math.round((raw / 5) * 20 * 10) / 10;
  return {
    key: "reliability",
    label: "Reliability",
    points,
    max: 20,
    stars: stars(points, 20),
    detail: info.reliability.summary,
  };
}

function scoreMarketValue(market: MarketComparison): ScoreCategory {
  // 0% savings = 12/20. Each +1% below market ≈ +0.8 pts, each -1% ≈ -1 pt.
  const pct = (market.savings / market.marketPrice) * 100;
  const points = Math.round(clamp(12 + (pct >= 0 ? pct * 0.8 : pct * 1.0), 0, 20) * 10) / 10;
  const src = market.method === "comparables" ? `${market.sampleSize} comparable listings` : "model baseline";
  const rel =
    market.savings >= 0
      ? `${cad(market.savings)} below market (${src})`
      : `${cad(-market.savings)} above market (${src})`;
  return {
    key: "marketValue",
    label: "Market Value",
    points,
    max: 20,
    stars: stars(points, 20),
    detail: `Market ${cad(market.marketPrice)} vs asking ${cad(market.listingPrice)} — ${rel}.`,
  };
}

function scoreOwnership(info: VehicleModelInfo): ScoreCategory {
  // Fuel: 6.5 L/100km → 5 stars, 10.5 → 1 star.
  const fuel = clamp(5 - (info.ownership.fuelCombLper100km - 6.5), 1, 5);
  // Maintenance: $350/yr → 5, $700/yr → 1.
  const maint = clamp(5 - (info.ownership.maintAnnualCad - 350) / 87.5, 1, 5);
  const raw =
    fuel * 0.3 +
    info.ownership.insuranceTier * 0.2 +
    maint * 0.25 +
    info.ownership.repairRisk * 0.15 +
    info.ownership.partsAvailability * 0.1;
  const points = Math.round((raw / 5) * 15 * 10) / 10;
  return {
    key: "ownership",
    label: "Ownership Cost",
    points,
    max: 15,
    stars: stars(points, 15),
    detail: `~${info.ownership.fuelCombLper100km} L/100km, ~${cad(info.ownership.maintAnnualCad)}/yr maintenance, insurance tier ${info.ownership.insuranceTier}/5.`,
  };
}

function scoreWinter(listing: Listing, info: VehicleModelInfo): ScoreCategory {
  const hasAwd = listing.drivetrain === "AWD" || listing.drivetrain === "4WD";
  const awdPts = hasAwd ? 5 : info.winter.awd === "none" ? 2 : 2.5;
  const clearance = clamp((info.winter.groundClearanceMm - 120) / 25, 1, 5); // 120mm→1, 220mm→4+
  const raw =
    awdPts * 0.4 + clearance * 0.2 + info.winter.winterReliability * 0.2 + info.winter.traction * 0.2;
  const points = Math.round((raw / 5) * 10 * 10) / 10;
  const dt = hasAwd ? `${listing.drivetrain} on this car` : `${listing.drivetrain} — plan on quality winter tires`;
  return {
    key: "winter",
    label: "Winter Capability",
    points,
    max: 10,
    stars: stars(points, 10),
    detail: `${dt}; ${info.winter.groundClearanceMm}mm clearance.`,
  };
}

const ADAS_FEATURES = ["blind spot", "lane keep", "adaptive cruise"];

function scoreSafety(listing: Listing, info: VehicleModelInfo): ScoreCategory {
  const base = info.safety.iihs * 0.5 + (info.safety.nhtsaStars / 5) * 5 * 0.3; // 0-4
  const feats = listing.features.map((f) => f.toLowerCase());
  const adasCount = ADAS_FEATURES.filter((f) => feats.some((x) => x.includes(f))).length;
  const raw = base + (adasCount / ADAS_FEATURES.length) * 5 * 0.2;
  const points = Math.round((raw / 5) * 10 * 10) / 10;
  return {
    key: "safety",
    label: "Safety",
    points,
    max: 10,
    stars: stars(points, 10),
    detail: `IIHS ${info.safety.iihs}/5, NHTSA ${info.safety.nhtsaStars}★. ${info.safety.adasNote}`,
  };
}

function scoreMileage(listing: Listing, info: VehicleModelInfo): ScoreCategory {
  if (listing.mileageKm == null) {
    return {
      key: "mileage",
      label: "Mileage",
      points: 5,
      max: 10,
      stars: 2.5,
      detail: "Mileage not stated on the listing — scored neutral.",
    };
  }
  const age = Math.max(1, CURRENT_YEAR - listing.year);
  const expected = age * info.expectedKmPerYear;
  const ratio = listing.mileageKm / expected; // 1.0 = exactly average
  // ratio 0.5 → 10 pts, 1.0 → 6.5 pts, 1.5 → 3 pts, 2.0 → 0.
  const points = Math.round(clamp(10 - (ratio - 0.5) * 7, 0, 10) * 10) / 10;
  const perYear = Math.round(listing.mileageKm / age);
  const vs = ratio <= 0.85 ? "well below" : ratio <= 1.1 ? "around" : "above";
  return {
    key: "mileage",
    label: "Mileage",
    points,
    max: 10,
    stars: stars(points, 10),
    detail: `${listing.mileageKm.toLocaleString()} km (${perYear.toLocaleString()} km/yr) — ${vs} the ~${expected.toLocaleString()} km expected at ${age} yr${age > 1 ? "s" : ""}.`,
  };
}

function scoreResale(info: VehicleModelInfo): ScoreCategory {
  const points = Math.round((info.resale / 5) * 5 * 10) / 10;
  return {
    key: "resale",
    label: "Resale Value",
    points,
    max: 5,
    stars: info.resale,
    detail: `${info.make} ${info.model} value retention rated ${info.resale}/5.`,
  };
}

function scoreRecalls(listing: Listing, info: VehicleModelInfo): ScoreCategory {
  let raw = info.recallsAndIssues.openRecallRisk; // 0-5
  if (listing.recalls.length > 0) raw = Math.min(raw, 2);
  if (listing.accidentReported === true) raw = Math.max(0, raw - 1);
  const points = Math.round((raw / 5) * 5 * 10) / 10;
  const majors = info.recallsAndIssues.issues.filter((i) => i.severity === "major");
  const detail =
    listing.recalls.length > 0
      ? `Listing reports open recall(s): ${listing.recalls.join("; ")}.`
      : majors.length > 0
        ? `Watch for: ${majors.map((i) => i.title).join("; ")}.`
        : info.recallsAndIssues.issues.length > 0
          ? `Minor pattern issues only for this model.`
          : "No significant pattern issues on record.";
  return { key: "recalls", label: "Recalls & Known Issues", points, max: 5, stars: stars(points, 5), detail };
}

function scoreWarranty(listing: Listing): ScoreCategory {
  let raw = 0;
  if (listing.cpo) raw += 3;
  if (listing.warrantyMonths != null) raw += clamp(listing.warrantyMonths / 24, 0, 2);
  else if (CURRENT_YEAR - listing.year <= 4) raw += 1; // likely some factory coverage left
  const points = Math.round(clamp(raw, 0, 3) * 10) / 10;
  const bits: string[] = [];
  if (listing.cpo) bits.push("Certified Pre-Owned");
  if (listing.warrantyMonths != null) bits.push(`~${listing.warrantyMonths} months warranty stated`);
  if (listing.warrantyNote) bits.push(listing.warrantyNote);
  if (bits.length === 0) bits.push(CURRENT_YEAR - listing.year <= 4 ? "May retain factory coverage — verify in-service date." : "No warranty stated.");
  return { key: "warranty", label: "CPO / Warranty", points, max: 3, stars: stars(points, 3), detail: bits.join(" · ") };
}

const DESIRABLE = [
  "heated seats",
  "remote start",
  "sunroof",
  "apple carplay",
  "android auto",
  "adaptive cruise",
];

function scoreFeatures(listing: Listing): ScoreCategory {
  const feats = listing.features.map((f) => f.toLowerCase());
  const have = DESIRABLE.filter((d) => feats.some((f) => f.includes(d)));
  const points = Math.round(clamp((have.length / DESIRABLE.length) * 2, 0, 2) * 10) / 10;
  return {
    key: "features",
    label: "Desirable Features",
    points,
    max: 2,
    stars: stars(points, 2),
    detail: have.length > 0 ? `Has: ${have.join(", ")}.` : "No desirable features listed.",
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Intrinsic 0–100 score for a *new* model (no price/mileage/market signal):
 * reliability, ownership, winter, safety, resale and recalls from the model
 * knowledge base, rescaled to 100. Returns null for models we don't cover.
 * New cars are assumed to ship with their typical features and full warranty.
 */
export function scoreNewModel(make: string, model: string, drivetrain?: string | null): number | null {
  const info = getModelInfo(make, model);
  if (!info) return null;
  const dt = /awd|4wd|all.?wheel/i.test(drivetrain ?? "")
    ? "AWD"
    : /fwd|front/i.test(drivetrain ?? "")
      ? "FWD"
      : info.winter.awd === "standard"
        ? "AWD"
        : "FWD";
  const synthetic = {
    drivetrain: dt,
    features: info.typicalFeatures,
    mileageKm: 0,
    year: CURRENT_YEAR,
    recalls: [] as string[],
    accidentReported: false,
  } as unknown as Listing;

  const cats = [
    scoreReliability(info),
    scoreOwnership(info),
    scoreWinter(synthetic, info),
    scoreSafety(synthetic, info),
    scoreResale(info),
    scoreRecalls(synthetic, info),
  ];
  const sum = cats.reduce((s, c) => s + c.points, 0);
  const max = cats.reduce((s, c) => s + c.max, 0); // 65
  return Math.round((sum / max) * 100);
}

export function scoreListing(listing: Listing, allListings: Listing[]): ScoreResult | null {
  const info = getModelInfo(listing.make, listing.model);
  if (!info) return null;

  const market = estimateMarketPrice(listing, info, allListings);
  const breakdown: ScoreCategory[] = [
    scoreReliability(info),
    scoreMarketValue(market),
    scoreOwnership(info),
    scoreWinter(listing, info),
    scoreSafety(listing, info),
    scoreMileage(listing, info),
    scoreResale(info),
    scoreRecalls(listing, info),
    scoreWarranty(listing),
    scoreFeatures(listing),
  ];
  const total = Math.round(breakdown.reduce((s, c) => s + c.points, 0) * 10) / 10;

  return {
    total,
    breakdown,
    market,
    dealRating: dealRating(market),
    knownIssues: info.recallsAndIssues.issues.map((i) =>
      i.note ? `${i.title} — ${i.note}` : i.title
    ),
    pros: info.pros,
    cons: info.cons,
  };
}
