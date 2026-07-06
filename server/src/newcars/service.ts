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
  return [...byId.values()].sort(
    (a, b) => a.make.localeCompare(b.make) || (a.startingPriceCad ?? 1e9) - (b.startingPriceCad ?? 1e9)
  );
}

/** Fetch Hyundai (fast) then OEMs (slow, browser), updating the cache as we go. */
async function refresh(log: LogFn): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const { requestTimeoutMs } = loadScrapeConfig();
    const hyundai = await fetchHyundaiNewCars(log, requestTimeoutMs).catch(() => []);
    cache = { fetchedAt: Date.now(), cars: merge(hyundai) };
    const oem = await fetchOemNewCars(log).catch(() => []);
    if (oem.length) cache = { fetchedAt: Date.now(), cars: merge(hyundai, oem) };
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
      cache = { fetchedAt: Date.now(), cars: merge(hyundai) };
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
    if (oem.length) cache = { fetchedAt: Date.now(), cars: merge(hyundai, oem) };
  } finally {
    refreshing = false;
  }
}
