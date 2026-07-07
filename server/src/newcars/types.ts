/** A new/current-model vehicle scraped from a manufacturer's official site. */
export interface NewCar {
  id: string; // "hyundai-tucson"
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
  source: string; // e.g. "Hyundai Canada"
  /** Intrinsic CarScore (0–100) for the model, or null if not in our knowledge base. */
  score: number | null;
}
