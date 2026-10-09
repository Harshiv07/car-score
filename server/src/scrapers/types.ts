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
  /**
   * What the source's own inventory feed said, vouched for by the scraper:
   * `true` = it read the whole inventory (so a car it no longer lists is gone,
   * even if that means zero cars); `false` = it knows the run was cut short;
   * absent = a bounded sample (the aggregators), judged by the sweep's floor.
   */
  complete?: boolean;
}

export interface Scraper {
  key: string;
  source: string;
  run(log: LogFn): Promise<ScraperRunResult>;
}
