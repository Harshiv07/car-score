import { Listing } from "../types";

export type LogFn = (level: "info" | "warn" | "error", message: string) => void;

export interface RawVehicleRecord {
  title?: string | null;
  name?: string | null;
  make?: string | null;
  model?: string | null;
  year?: unknown;
  price?: unknown;
  km?: unknown;
  drivetrain?: string | null;
  /** Explicit fuel text (e.g. "Gasoline", "Hybrid") when the source states it,
   *  so it doesn't have to be smuggled through the title (which pollutes trim
   *  extraction). normalize prefers this over inferring from the title text. */
  fuel?: string | null;
  vin?: string | null;
  trim?: string | null;
  url?: string | null;
  image?: string | null;
  engine?: string | null;
  transmission?: string | null;
  exteriorColour?: string | null;
  interiorColour?: string | null;
  fuelEconomy?: unknown;
  cpo?: boolean;
  carfax?: boolean;
  features?: string[];
}

export interface ScraperRunResult {
  key: string;
  source: string;
  listings: Listing[];
  ok: boolean;
  note: string;
}

export interface Scraper {
  key: string;
  source: string;
  run(log: LogFn): Promise<ScraperRunResult>;
}
