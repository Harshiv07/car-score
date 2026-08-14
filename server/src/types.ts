/**
 * Shared domain types for CarScore V2.
 *
 * `Listing` is the single normalized shape every scraper must return and the
 * shape stored in the Listings collection. Score data is computed at read
 * time by the scoring engine and attached as `ScoredListing`.
 */

export type Drivetrain = "AWD" | "4WD" | "FWD" | "RWD" | "Unknown";
export type FuelType = "Gas" | "Hybrid" | "Diesel" | "Electric" | "Unknown";

export interface Listing {
  id: string;
  dedupeKey: string;

  title: string;
  make: string;
  model: string;
  trim: string | null;
  year: number;
  drivetrain: Drivetrain;
  engine: string | null;
  transmission: string | null;
  fuelType: FuelType;
  vin: string | null;

  price: number;
  mileageKm: number | null;
  fuelEconomy: number | null; // combined L/100km if the listing states it

  exteriorColour: string | null;
  interiorColour: string | null;

  dealer: string | null;
  isDealer: boolean;
  city: string | null;
  province: string | null;

  sourceWebsite: string; // e.g. "AutoTrader.ca"
  listingUrl: string | null;
  image: string | null;

  cpo: boolean;
  warrantyMonths: number | null;
  warrantyNote: string | null;
  carfaxAvailable: boolean;
  accidentReported: boolean | null; // null = unknown
  recalls: string[]; // open recalls stated on the listing, if any

  features: string[]; // heated seats, remote start, sunroof, CarPlay, ...

  firstSeenAt: string; // ISO
  lastSeenAt: string; // ISO
}

/** A single scored category in the 100-point breakdown. */
export interface ScoreCategory {
  key: string;
  label: string;
  points: number;
  max: number;
  stars: number; // 0-5, for display
  detail: string;
}

export type DealRating =
  | "Excellent Deal"
  | "Great Deal"
  | "Good Deal"
  | "Fair Price"
  | "Above Market"
  | "Overpriced";

export interface MarketComparison {
  marketPrice: number;
  listingPrice: number;
  savings: number; // positive = below market
  sampleSize: number; // comparable listings used; 0 = model baseline used
  method: "comparables" | "baseline";
}

export interface ScoreResult {
  total: number; // 0-100
  breakdown: ScoreCategory[];
  market: MarketComparison;
  dealRating: DealRating;
  knownIssues: string[];
  pros: string[];
  cons: string[];
}

export interface ScoredListing extends Listing {
  score: ScoreResult;
  badges: string[];
  /** No crawl has confirmed this listing is still up in over 5 days — likely sold or delisted. */
  stale: boolean;
}

export interface ScrapeHistoryEntry {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  totalFound: number;
  totalInserted: number;
  totalUpdated: number;
  sources: { source: string; found: number; ok: boolean; note: string }[];
}

export interface ScrapeProgress {
  running: boolean;
  runId: string | null;
  startedAt: string | null;
  currentSource: string | null;
  sourcesDone: number;
  sourcesTotal: number;
  logs: { time: string; level: "info" | "warn" | "error"; message: string }[];
  lastScrapeTime: string | null;
  cooldownSecondsRemaining: number;
}

export interface ListingFilters {
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  make?: string;
  model?: string;
  province?: string;
  city?: string;
  drivetrain?: string;
  fuelType?: string;
  cpoOnly?: boolean;
  dealerOnly?: boolean;
  sourceWebsite?: string;
  scoreMin?: number;
  scoreMax?: number;
}

export type SortKey =
  | "score" // Best Score
  | "deal" // Best Deal (savings vs market)
  | "mileage" // Lowest Mileage
  | "price" // Lowest Price
  | "reliability" // Highest Reliability
  | "newest" // Newest
  | "resale"; // Best Resale
