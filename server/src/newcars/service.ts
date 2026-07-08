/**
 * New-cars service: aggregates official-site model data and caches it (these
 * OEM pages change rarely and are slow to render, so a long TTL is fine).
 *
 * Hyundai is browser-free and fast, so it's fetched synchronously on a cold
 * cache. Toyota/Honda/Mazda/Subaru render client-side and are fetched with the
 * Playwright fallback in the BACKGROUND — the request returns immediately with
 * whatever is cached plus a `loading` flag, and the cache fills in as pages
 * render. Hosts without Chromium simply never get the OEM entries.
 */

import { loadScrapeConfig } from "../scrapers/config";
import { LogFn } from "../scrapers/types";
import { NewCar } from "./types";
import { fetchHyundaiNewCars } from "./hyundai";
import { fetchOemNewCars } from "./oem";
import { fetchCarImage } from "./util";
import { scoreNewModel } from "../scoring/engine";
import manualConfig from "../config/newcarsManual.json";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry {
  fetchedAt: number;
  cars: NewCar[];
}
let cache: CacheEntry | null = null;
let refreshing = false;

const noopLog: LogFn = () => {};

function merge(...groups: NewCar[][]): NewCar[] {
  const byId = new Map<string, NewCar>();
  for (const g of groups) for (const c of g) byId.set(c.id, c);
  return [...byId.values()];
}

interface ManualCar {
  make: string;
  model: string;
  year: number;
  officialUrl: string;
  startingPriceCad?: number | null;
  bodyType?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  fuelCapacity?: string | null;
  exteriorColours?: string[];
  description?: string | null;
  image?: string | null;
}

const carId = (make: string, model: string) => `${make}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Overlay the hand-maintained data (config/newcarsManual.json) onto the
 * scraped set: any non-null manual field wins, and manual-only models get
 * their own card. Exported for tests.
 */
export function applyManual(cars: NewCar[], manual: ManualCar[] = manualConfig.cars as ManualCar[]): NewCar[] {
  const byId = new Map(cars.map((c) => [c.id, c]));
  for (const m of manual) {
    if (!m.make || !m.model || !m.year || !m.officialUrl) continue;
    const id = carId(m.make, m.model);
    const target: NewCar = byId.get(id) ?? {
      id,
      make: m.make,
      model: m.model,
      year: m.year,
      bodyType: null,
      startingPriceCad: null,
      engine: null,
      transmission: null,
      drivetrain: null,
      fuelType: null,
      fuelCapacity: null,
      exteriorColours: [],
      description: null,
      image: null,
      officialUrl: m.officialUrl,
      source: `${m.make} Canada`,
      score: null,
    };
    for (const key of [
      "year", "bodyType", "startingPriceCad", "engine", "transmission", "drivetrain",
      "fuelType", "fuelCapacity", "description", "image", "officialUrl",
    ] as const) {
      const v = m[key];
      if (v != null && v !== "") (target as unknown as Record<string, unknown>)[key] = v;
    }
    if (m.exteriorColours?.length) target.exteriorColours = m.exteriorColours;
    byId.set(id, target);
  }
  return [...byId.values()];
}

function finalize(cars: NewCar[]): NewCar[] {
  for (const c of cars) c.score = scoreNewModel(c.make, c.model, c.drivetrain);
  // Best score first within each make, makes alphabetical.
  return cars.sort((a, b) => a.make.localeCompare(b.make) || (b.score ?? -1) - (a.score ?? -1));
}

/** Fill in a real photo (Wikipedia) for any car whose OEM page had no image. */
async function enrichImages(cars: NewCar[]): Promise<NewCar[]> {
  await Promise.all(
    cars
      .filter((c) => !c.image)
      .map((c) => fetchCarImage(c.make, c.model).then((img) => { if (img) c.image = img; })),
  );
  return cars;
}

async function build(...groups: NewCar[][]): Promise<CacheEntry> {
  return { fetchedAt: Date.now(), cars: await enrichImages(finalize(applyManual(merge(...groups)))) };
}

/** Fetch Hyundai (fast) then OEMs (slow, browser), updating the cache as we go. */
async function refresh(log: LogFn): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const { requestTimeoutMs } = loadScrapeConfig();
    const hyundai = await fetchHyundaiNewCars(log, requestTimeoutMs).catch(() => []);
    cache = await build(hyundai);
    const oem = await fetchOemNewCars(log).catch(() => []);
    if (oem.length) cache = await build(hyundai, oem);
  } finally {
    refreshing = false;
  }
}

export interface NewCarsResult {
  cars: NewCar[];
  fetchedAt: string | null;
  loading: boolean;
}

export async function getNewCars(force = false, log: LogFn = noopLog): Promise<NewCarsResult> {
  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;

  if (!fresh || force) {
    if (!cache) {
      // Cold start: block only on the fast browser-free source so the tab has
      // something immediately; OEM rendering continues in the background.
      const { requestTimeoutMs } = loadScrapeConfig();
      const hyundai = await fetchHyundaiNewCars(log, requestTimeoutMs).catch(() => []);
      cache = await build(hyundai);
      void refreshOem(log, hyundai);
    } else {
      void refresh(log);
    }
  }

  return {
    cars: cache?.cars ?? [],
    fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null,
    loading: refreshing,
  };
}

/** Background OEM pass that appends to an existing Hyundai-only cache. */
async function refreshOem(log: LogFn, hyundai: NewCar[]): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const oem = await fetchOemNewCars(log).catch(() => []);
    if (oem.length) cache = await build(hyundai, oem);
  } finally {
    refreshing = false;
  }
}
