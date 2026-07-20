/**
 * Config + hard-bound guarantees: the run must be tunable from the environment
 * and a single stalled source must never hang the run.
 */

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchRenderedViaService, loadScrapeConfig } from "../scrapers/config";
import { runWithTimeout } from "../services/scrapeService";
import { LogFn, Scraper } from "../scrapers/types";

const noop: LogFn = () => {};
const ENV_KEYS = [
  "SCRAPE_RUN_BUDGET_MS",
  "SCRAPE_SOURCE_TIMEOUT_MS",
  "SCRAPE_MAX_PAGES",
  "SCRAPE_SOURCES",
  "SCRAPE_JS_FALLBACK",
  "RENDER_SERVICE_URL",
  "RENDER_SERVICE_API_KEY",
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

test("config has fast, safe defaults", () => {
  const c = loadScrapeConfig();
  // 180s/90s: CarGurus's Scrapfly-rendered per-model calls take real
  // wall-clock time (~7-10s each, verified live) — a higher ceiling is free
  // for the sources that finish in seconds, so this isn't the "no source
  // should ever be slow" assumption the original 120s/30s encoded.
  assert.equal(c.runBudgetMs, 180_000, "default run budget is 3 minutes");
  assert.equal(c.sourceTimeoutMs, 90_000, "default per-source cap is 90s");
  assert.ok(c.sourceTimeoutMs <= c.runBudgetMs);
  assert.equal(c.jsFallbackEnabled, true, "rendered fallback on by default (fails fast without a browser)");
  assert.equal(c.enabledSourceKeys, null, "all sources by default");
});

test("SCRAPE_JS_FALLBACK=0 disables the rendered fallback", () => {
  process.env.SCRAPE_JS_FALLBACK = "0";
  assert.equal(loadScrapeConfig().jsFallbackEnabled, false);
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
  assert.equal(c.runBudgetMs, 180_000);
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

test("fetchRenderedViaService reports why it failed, not just that it did", async (t) => {
  // Guards the bug this was built to diagnose: a bare "returned nothing" log
  // gives no way to tell an auth/param error, a quota error and the target
  // site blocking the rendering proxy's IP apart — three very different
  // problems that all looked identical before this.
  delete process.env.RENDER_SERVICE_URL;
  const unset = await fetchRenderedViaService("https://example.com");
  assert.equal(unset.html, null);
  assert.match(unset.failureReason ?? "", /not set/);

  process.env.RENDER_SERVICE_URL = "https://render.example/api?key=bad&url={url}";
  t.mock.method(globalThis, "fetch", async () => new Response('{"message":"Invalid api key"}', { status: 401 }));
  const authFail = await fetchRenderedViaService("https://example.com");
  assert.equal(authFail.html, null);
  assert.match(authFail.failureReason ?? "", /HTTP 401/);
  assert.match(authFail.failureReason ?? "", /Invalid api key/);
});

test("fetchRenderedViaService treats a too-short body as a failure, not a real page", async (t) => {
  process.env.RENDER_SERVICE_URL = "https://render.example/api?url={url}";
  t.mock.method(globalThis, "fetch", async () => new Response("blocked", { status: 200 }));
  const result = await fetchRenderedViaService("https://example.com");
  assert.equal(result.html, null);
  assert.match(result.failureReason ?? "", /too short/);
});

test("fetchRenderedViaService returns the HTML on a real success", async (t) => {
  process.env.RENDER_SERVICE_URL = "https://render.example/api?url={url}";
  const page = `<html><body>${"x".repeat(600)}</body></html>`;
  t.mock.method(globalThis, "fetch", async () => new Response(page, { status: 200 }));
  const result = await fetchRenderedViaService("https://example.com");
  assert.equal(result.html, page);
  assert.equal(result.failureReason, undefined);
});
