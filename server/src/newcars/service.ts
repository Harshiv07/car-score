/**
 * New-cars service: aggregates official-site model data and caches it (these
 * OEM pages change rarely and are slow to fetch, so a long TTL is fine). More
 * manufacturers can be added here as adapters — Hyundai is browser-free today;
 * Toyota/Honda/Mazda/Subaru render their model data client-side and would need
 * the Playwright fallback.
 */

import { loadScrapeConfig } from "../scrapers/config";
import { LogFn } from "../scrapers/types";
import { NewCar } from "./types";
import { fetchHyundaiNewCars } from "./hyundai";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry {
  fetchedAt: number;
  cars: NewCar[];
}
let cache: CacheEntry | null = null;
let inFlight: Promise<NewCar[]> | null = null;

const noopLog: LogFn = () => {};

async function fetchAll(log: LogFn): Promise<NewCar[]> {
  const { requestTimeoutMs } = loadScrapeConfig();
  const results = await Promise.allSettled([fetchHyundaiNewCars(log, requestTimeoutMs)]);
  const cars = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Cheapest first within each make, makes first alphabetically.
  cars.sort((a, b) => a.make.localeCompare(b.make) || (a.startingPriceCad ?? 1e9) - (b.startingPriceCad ?? 1e9));
  return cars;
}

export interface NewCarsResult {
  cars: NewCar[];
  fetchedAt: string | null;
  stale: boolean;
}

export async function getNewCars(force = false, log: LogFn = noopLog): Promise<NewCarsResult> {
  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;
  if (!force && fresh) {
    return { cars: cache!.cars, fetchedAt: new Date(cache!.fetchedAt).toISOString(), stale: false };
  }

  if (!inFlight) {
    inFlight = fetchAll(log)
      .then((cars) => {
        // Keep a previous non-empty cache if a refresh comes back empty.
        if (cars.length > 0 || !cache) cache = { fetchedAt: Date.now(), cars };
        return cache.cars;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  try {
    const cars = await inFlight;
    return { cars, fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null, stale: false };
  } catch {
    // Serve stale cache on failure rather than erroring the tab.
    return {
      cars: cache?.cars ?? [],
      fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null,
      stale: true,
    };
  }
}
