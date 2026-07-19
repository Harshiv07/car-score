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
  "APIFY_TOKEN",
  "APIFY_ACTOR_ID",
  "APIFY_PROXY_GROUPS",
  "APIFY_PROXY_COUNTRY",
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

test("config has safe defaults that favor more data over raw speed", () => {
  const c = loadScrapeConfig();
  assert.equal(c.runBudgetMs, 240_000, "default run budget is 4 minutes — a background job, not a blocking request");
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
  assert.equal(c.runBudgetMs, 240_000);
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
  // Guards the exact bug the ScrapingBee integration went through undiagnosed
  // for multiple rounds: a bare "returned nothing" log gives no way to tell
  // an auth/param error, a quota error and the target blocking the proxy's
  // IP apart — three very different problems that look identical without this.
  delete process.env.APIFY_TOKEN;
  const unset = await fetchRenderedViaService("https://example.com");
  assert.equal(unset.html, null);
  assert.match(unset.failureReason ?? "", /APIFY_TOKEN not set/);

  process.env.APIFY_TOKEN = "bad-token";
  t.mock.method(globalThis, "fetch", async () => new Response('{"error":{"type":"token-not-found"}}', { status: 401 }));
  const authFail = await fetchRenderedViaService("https://example.com");
  assert.equal(authFail.html, null);
  assert.match(authFail.failureReason ?? "", /HTTP 401/);
  assert.match(authFail.failureReason ?? "", /token-not-found/);
});

test("fetchRenderedViaService calls the configured actor with token, target url and residential proxy by default", async (t) => {
  process.env.APIFY_TOKEN = "tok_123";
  let calledUrl = "";
  let calledBody: any;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    calledUrl = String(input);
    calledBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify([{ url: "https://example.com", html: `<html>${"x".repeat(600)}</html>` }]), { status: 200 });
  });
  await fetchRenderedViaService("https://example.com/cars");

  assert.match(calledUrl, /^https:\/\/api\.apify\.com\/v2\/acts\/apify~web-scraper\/run-sync-get-dataset-items\?/);
  assert.match(calledUrl, /token=tok_123/);
  assert.deepEqual(calledBody.startUrls, [{ url: "https://example.com/cars" }]);
  assert.deepEqual(calledBody.proxyConfiguration, { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] });
});

test("APIFY_ACTOR_ID, APIFY_PROXY_COUNTRY and APIFY_PROXY_GROUPS=NONE are respected", async (t) => {
  process.env.APIFY_TOKEN = "tok_123";
  process.env.APIFY_ACTOR_ID = "custom~actor";
  process.env.APIFY_PROXY_COUNTRY = "CA";
  let calledUrl = "";
  let calledBody: any;
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    calledUrl = String(input);
    calledBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify([{ html: `<html>${"x".repeat(600)}</html>` }]), { status: 200 });
  });
  await fetchRenderedViaService("https://example.com");
  assert.match(calledUrl, /\/acts\/custom~actor\//);
  assert.deepEqual(calledBody.proxyConfiguration, { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "CA" });

  process.env.APIFY_PROXY_GROUPS = "NONE";
  await fetchRenderedViaService("https://example.com");
  assert.deepEqual(calledBody.proxyConfiguration, { useApifyProxy: false });
});

test("fetchRenderedViaService surfaces the actual dataset item when it has no usable html field", async (t) => {
  // Apify actor output field names can vary by version — silently guessing
  // wrong is exactly how the previous rendering-service integration went
  // undiagnosed for multiple rounds. Must show the real shape received.
  process.env.APIFY_TOKEN = "tok_123";
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify([{ url: "https://example.com", "#error": true }]), { status: 200 }));
  const result = await fetchRenderedViaService("https://example.com");
  assert.equal(result.html, null);
  assert.match(result.failureReason ?? "", /no usable "html" field/);
  assert.match(result.failureReason ?? "", /#error/);
});

test("fetchRenderedViaService returns the HTML on a real success", async (t) => {
  process.env.APIFY_TOKEN = "tok_123";
  const page = `<html><body>${"x".repeat(600)}</body></html>`;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify([{ url: "https://example.com", html: page }]), { status: 200 }));
  const result = await fetchRenderedViaService("https://example.com");
  assert.equal(result.html, page);
  assert.equal(result.failureReason, undefined);
});
