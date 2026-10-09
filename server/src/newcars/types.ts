export const POWERTRAINS = ["Gas", "Hybrid", "Plug-in hybrid", "Electric"] as const;
export type Powertrain = (typeof POWERTRAINS)[number];

export const BODY_GROUPS = ["Sedan", "SUV"] as const;
export type BodyGroup = (typeof BODY_GROUPS)[number];

/** One priced configuration of a model. `priceCad` is null when no Canadian MSRP is confirmed. */
export interface NewTrim {
  name: string;
  priceCad: number | null;
  powertrain: Powertrain;
  drivetrain: string | null;
  /** Combined L/100 km, only where a source stated it. */
  fuelEconomyL100?: number | null;
}

/** A current-model vehicle in the curated Canadian lineup (server/src/data/newCars.json). */
export interface NewCar {
  id: string; // "toyota-rav4"
  make: string;
  model: string;
  year: number;
  /** "Compact SUV", "Midsize sedan": shown on the card. */
  bodyType: string;
  /** The two-way split the page filters on. */
  bodyGroup: BodyGroup;
  seats: number | null;
  /** Every powertrain offered, from the trims. */
  fuels: Powertrain[];
  /** Every drivetrain offered, where the trims say. Empty when unknown. */
  drivetrains: string[];
  trims: NewTrim[];
  /** Lowest confirmed trim price, or null. */
  startingPriceCad: number | null;
  /** Best combined L/100 km among trims that state one. */
  fuelEconomyL100: number | null;
  image: string | null;
  officialUrl: string;
  /** Where the prices came from, in words. */
  priceSource: string;
  /** Intrinsic CarScore (0-100) for the model, or null if not in our knowledge base. */
  score: number | null;

  // Fields the first version of the page reads; kept so it keeps working until it is redesigned.
  /** Joined from `drivetrains`. */
  drivetrain: string | null;
  /** Joined from `fuels`. */
  fuelType: string | null;
  engine: string | null;
  transmission: string | null;
  fuelCapacity: string | null;
  exteriorColours: string[];
  description: string | null;
  /** The brand's Canadian arm, e.g. "Honda Canada": the first version of the page links to it. */
  source: string;
}
