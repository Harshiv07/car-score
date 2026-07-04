/**
 * Config + hard-bound guarantees: the run must be tunable from the environment
 * and a single stalled source must never hang the run.
 */

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadScrapeConfig } from "../scrapers/config";
import { runWithTimeout } from "../services/scrapeService";
import { LogFn, Scraper } from "../scrapers/types";

const noop: LogFn = () => {};
const ENV_KEYS = [
  "SCRAPE_RUN_BUDGET_MS",
  "SCRAPE_SOURCE_TIMEOUT_MS",
  "SCRAPE_MAX_PAGES",
  "SCRAPE_SOURCES",
  "SCRAPE_JS_FALLBACK",
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

test("config has fast, safe defaults", () => {
  const c = loadScrapeConfig();
  assert.equal(c.runBudgetMs, 120_000, "default run budget is 2 minutes");
  assert.ok(c.sourceTimeoutMs <= c.runBudgetMs);
  assert.equal(c.jsFallbackEnabled, false, "browser fallback off by default");
  assert.equal(c.enabledSourceKeys, null, "all sources by default");
});

test("config reads overrides from the environment", () => {
  process.env.SCRAPE_RUN_BUDGET_MS = "45000";
  process.env.SCRAPE_MAX_PAGES = "2";
  process.env.SCRAPE_SOURCES = "clutch, autotrader";
  process.env.SCRAPE_JS_FALLBACK = "1";
  const c = loadScrapeConfig();
  assert.equal(c.runBudgetMs, 45000);
  assert.equal(c.maxPagesPerSource, 2);
  assert.deepEqual(c.enabledSourceKeys, ["clutch", "autotrader"]);
  assert.equal(c.jsFallbackEnabled, true);
});

test("bad env values fall back to defaults instead of NaN", () => {
  process.env.SCRAPE_RUN_BUDGET_MS = "not-a-number";
  process.env.SCRAPE_MAX_PAGES = "-5";
  const c = loadScrapeConfig();
  assert.equal(c.runBudgetMs, 120_000);
  assert.equal(c.maxPagesPerSource, 4);
});

test("a stalled source is cut off by the per-source timeout (never hangs)", async () => {
  const neverResolves: Scraper = {
    key: "stall",
    source: "Stall",
    run: () => new Promise(() => {}), // hangs forever
  };
  const t0 = Date.now();
  const result = await runWithTimeout(neverResolves, noop, 300);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 2000, `should return promptly, took ${elapsed}ms`);
  assert.equal(result.ok, false);
  assert.equal(result.listings.length, 0);
  assert.match(result.note, /timed out/);
});

test("a fast source returns its own result, not the timeout", async () => {
  const fast: Scraper = {
    key: "fast",
    source: "Fast",
    run: async () => ({ key: "fast", source: "Fast", listings: [], ok: true, note: "done" }),
  };
  const result = await runWithTimeout(fast, noop, 5000);
  assert.equal(result.ok, true);
  assert.equal(result.note, "done");
});
