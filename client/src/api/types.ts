/** Mirrors of the server's response shapes (server/src/types.ts). */

export type Drivetrain = "AWD" | "4WD" | "FWD" | "RWD" | "Unknown";

export interface ScoreCategory {
  key: string;
  label: string;
  points: number;
  max: number;
  stars: number;
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
  savings: number;
  sampleSize: number;
  method: "comparables" | "baseline";
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreCategory[];
  market: MarketComparison;
  dealRating: DealRating;
  knownIssues: string[];
  pros: string[];
  cons: string[];
}

export interface ScoredListing {
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
  fuelType: string;
  vin: string | null;
  price: number;
  mileageKm: number | null;
  fuelEconomy: number | null;
  exteriorColour: string | null;
  interiorColour: string | null;
  dealer: string | null;
  isDealer: boolean;
  city: string | null;
  province: string | null;
  sourceWebsite: string;
  listingUrl: string | null;
  image: string | null;
  cpo: boolean;
  warrantyMonths: number | null;
  warrantyNote: string | null;
  carfaxAvailable: boolean;
  accidentReported: boolean | null;
  recalls: string[];
  features: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  score: ScoreResult;
  badges: string[];
}

export interface ListingsResponse {
  total: number;
  totalUnfiltered: number;
  page: number;
  pageSize: number;
  sort: string;
  listings: ScoredListing[];
}

export interface KnownIssue {
  title: string;
  severity: "minor" | "moderate" | "major";
  note?: string;
}

export interface ListingDetailResponse {
  listing: ScoredListing;
  ownership: {
    assumptions: { kmPerYear: number; fuelPriceCadPerL: number };
    fuelAnnual: number;
    insuranceAnnual: number;
    maintenanceAnnual: number;
    totalAnnual: number;
  } | null;
  modelInfo: {
    body: string;
    reliabilitySummary: string;
    adasNote: string;
    knownIssues: KnownIssue[];
    typicalFeatures: string[];
  } | null;
  alternatives: ScoredListing[];
  externalLinks: { label: string; url: string }[];
}

export interface MetaResponse {
  brands: string[];
  models: { make: string; model: string; body: string }[];
  provinces: string[];
  cities: string[];
  sources: string[];
  drivetrains: string[];
  fuelTypes: string[];
  sortOptions: { key: string; label: string }[];
  storage: string;
}

export interface NewCar {
  id: string;
  make: string;
  model: string;
  year: number;
  bodyType: string | null;
  startingPriceCad: number | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuelType: string | null;
  fuelCapacity: string | null;
  exteriorColours: string[];
  description: string | null;
  image: string | null;
  officialUrl: string;
  source: string;
}

export interface NewCarsResponse {
  cars: NewCar[];
  fetchedAt: string | null;
  loading: boolean;
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
