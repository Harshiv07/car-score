/**
 * Guards the fix for: Clutch make-level pagination silently starved
 * low-volume models (Mazda CX-5/Mazda3 got pushed off the fetched window by
 * Mazda's other models — CX-30/CX-50/CX-70/CX-90/MX-5/Mazda6). The scraper now
 * queries `makes[]=X&models[]=Y` per supported model instead of paginating a
 * make's whole inventory, verified live against the Clutch API for Mazda
 * CX-5 (54 results), Mazda3 (39) and Toyota RAV4 (111) before this session's
 * dev IP hit the AWS WAF rate limit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModelQueryUrl, clutch, MODEL_TARGETS } from "../scrapers/clutch";
import { VEHICLE_MODELS } from "../data/vehicleModels";

// Force the JS/browser fallback off for these tests: a failed model now
// triggers a real-browser retry pass (see crawl.ts's openBrowserSession),
// which is correct scraper behaviour but would make a "unit" test slow and
// network-dependent (it would actually launch Chromium and hit clutch.ca).
// The browser-retry path itself is verified live, not here.
process.env.SCRAPE_JS_FALLBACK = "0";

test("every scored model gets its own Clutch query target", () => {
  assert.equal(MODEL_TARGETS.length, VEHICLE_MODELS.length);
  const has = (make: string, model: string) =>
    MODEL_TARGETS.some((t) => t.make === make && t.model === model);
  // The two models the user reported as missing entirely.
  assert.ok(has("Mazda", "CX-5"), "Mazda CX-5 must be its own query target");
  assert.ok(has("Mazda", "Mazda3"), "Mazda Mazda3 must be its own query target");
  assert.ok(has("Toyota", "RAV4"));
  assert.ok(has("Honda", "CR-V"));
});

test("the query URL scopes to models[], not just makes[] (the actual fix)", () => {
  const url = buildModelQueryUrl("Mazda", "CX-5", 0);
  assert.match(url, /makes\[\]=Mazda/);
  assert.match(url, /models\[\]=CX-5/, "must filter by model so low-volume models aren't paginated out");
  assert.match(url, /page=0/);
});

test("model names with special characters are URL-encoded", () => {
  const url = buildModelQueryUrl("Honda", "CR-V", 1);
  assert.ok(!url.includes(" "), "no raw spaces in the URL");
  assert.match(url, /models\[\]=CR-V/);
});

test("query has exactly the params a real browser session sends — nothing extra", () => {
  // Regression: an earlier version added a non-functional `pc=` (page size)
  // param that no real clutch.ca session ever sends. Clutch silently ignored
  // it, but the scraper started getting WAF-blocked after 1-2 requests once
  // it was added — a request shape a real browser never produces is exactly
  // the kind of signal bot detection looks for. Every param here is one
  // captured from real clutch.ca frontend traffic.
  const url = buildModelQueryUrl("Toyota", "RAV4", 0);
  const params = new URL(url).searchParams;
  assert.deepEqual(
    [...params.keys()].sort(),
    ["downPayment", "interestRate", "isBiweekly", "makes[]", "models[]", "page"].sort()
  );
});

test(
  "a WAF block on 2 models never stops the remaining models from being attempted (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Reproduces the exact production failure: Honda CR-V and Mazda Mazda3 get
    // WAF-challenged (HTTP 202, empty body) back-to-back. A prior version's
    // circuit breaker treated that as "the whole run is blocked" and silently
    // skipped every model queried after them (Mazda CX-5, both Hyundais, both
    // Subarus) — they were never even attempted, which is what the user saw
    // as 0 listings for CX-5/Forester/Crosstrek despite Clutch "succeeding".
    const BLOCKED = new Set(["CR-V", "Mazda3"]);
    const requestedModels: string[] = [];

    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const model = new URL(input).searchParams.get("models[]") ?? "";
      requestedModels.push(model);
      if (BLOCKED.has(model)) {
        return new Response("", { status: 202 }); // WAF challenge, not a real 404
      }
      return new Response(JSON.stringify({ page: 0, pageSize: 32, totalCount: 0, totalPages: 1, vehicles: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await clutch.run(() => {});

    const attempted = new Set(requestedModels);
    for (const { model } of MODEL_TARGETS) {
      assert.ok(attempted.has(model), `${model} should have been attempted regardless of earlier blocked models`);
    }
  }
);

test(
  "breadth first, then depth: every model gets page 0 before any model gets page 2+ (regression)",
  { timeout: 20_000 },
  async (t) => {
    // "All models fetched" and "more pages per model" compete for the same
    // tiny per-run budget (confirmed live: Clutch's WAF allows only ~3-4
    // requests through per run, and slowing the request pacing 7x made no
    // difference — it's a count budget, not a rate limit). Spending that
    // budget depth-first on whichever model is queried first would starve
    // every other model completely, so phase 1 must fetch page 0 for EVERY
    // model before phase 2 spends any leftover budget on further pages —
    // and phase 2 must spread those extra pages across models (round-robin),
    // not exhaust them on a single one.
    const DEEP = new Set(["RAV4", "Civic", "Elantra"]); // 3 models report >1 page available
    process.env.SCRAPE_MAX_PAGES = "3";
    t.after(() => delete process.env.SCRAPE_MAX_PAGES);

    const requested: { model: string; page: number }[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const url = new URL(input);
      const model = url.searchParams.get("models[]") ?? "";
      const page = Number(url.searchParams.get("page"));
      requested.push({ model, page });
      if (page >= 2) return new Response("", { status: 202 }); // budget exhausted from page 2 on
      const totalPages = DEEP.has(model) ? 3 : 1;
      return new Response(
        JSON.stringify({
          page,
          pageSize: 32,
          totalCount: totalPages * 32,
          totalPages,
          vehicles: [
            {
              id: 1,
              year: 2022,
              make: { name: model === "RAV4" ? "Toyota" : model === "Civic" ? "Honda" : "Hyundai" },
              model: { name: model },
              ["vehiclePrice-ON"]: { price: 20000 + page },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const result = await clutch.run(() => {});

    // Every model's page 0 was requested before ANY model's page 1 — true
    // breadth-first ordering, not just "eventually attempted".
    const firstPage1Index = requested.findIndex((r) => r.page === 1);
    const page0Requests = requested.filter((r) => r.page === 0);
    assert.equal(page0Requests.length, MODEL_TARGETS.length, "every model must get a page-0 request");
    assert.ok(
      requested.slice(0, MODEL_TARGETS.length).every((r) => r.page === 0),
      "all 10 page-0 requests must happen before any page-1 request (breadth before depth)"
    );
    assert.ok(firstPage1Index >= MODEL_TARGETS.length - 1);

    // Depth requests only ever went to the 3 models that reported more pages.
    const page1Requests = requested.filter((r) => r.page === 1);
    assert.ok(page1Requests.every((r) => DEEP.has(r.model)), "page-1 must only be requested for models with totalPages > 1");
    assert.ok(page1Requests.length <= DEEP.size);

    // Once page 2 starts failing, the depth pass stops entirely on the FIRST
    // such failure — everything found at page 0/1 (breadth + first depth
    // round) is preserved, but it must not keep trying page 2 for every deep
    // model in turn (that would just be more failed requests for no gain).
    const page2Attempts = requested.filter((r) => r.page === 2).length;
    assert.ok(page2Attempts >= 1, "page 2 should have been attempted at least once (that's what signals budget exhaustion)");
    assert.ok(page2Attempts <= 1, "must stop immediately on the first page-2 failure, not try it for every deep model");
    assert.equal(result.listings.length, MODEL_TARGETS.length + DEEP.size, "10 from page 0 + 3 from the one successful depth round, page-2 data never ingested");
  }
);

test(
  "the retry tier tries Apify first, and never touches the local browser when Apify recovers everything",
  { timeout: 20_000 },
  async (t) => {
    // Fixes the exact production bug reported: Clutch's retry tier logged
    // "Browser fallback disabled: Chromium is not installed" even with Apify
    // configured, because it only ever knew how to retry via a LOCAL
    // Playwright session — Apify was wired into renderPage() (CarGurus/
    // AutoTrader/dealers) but never into this separate retry mechanism.
    process.env.SCRAPE_JS_FALLBACK = "1";
    process.env.APIFY_TOKEN = "test-token";
    t.after(() => {
      process.env.SCRAPE_JS_FALLBACK = "0";
      delete process.env.APIFY_TOKEN;
    });

    const BLOCKED = new Set(["CR-V", "Mazda3"]);
    let localBrowserWasLaunched = false;

    t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.clutch.ca")) {
        const model = new URL(url).searchParams.get("models[]") ?? "";
        if (BLOCKED.has(model)) return new Response("", { status: 202 });
        return new Response(JSON.stringify({ page: 0, pageSize: 32, totalCount: 0, totalPages: 1, vehicles: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("api.apify.com")) {
        // The in-page-fetch pageFunction template ends with
        // `}, ${JSON.stringify(apiUrl)});` — pull the target Clutch API url
        // straight out of that (JSON.stringify only escapes quotes/backslashes/
        // control chars, so & [ ] = pass through untouched and URLSearchParams
        // parses it directly).
        const body = JSON.parse(String(init?.body));
        const targetUrl = String(body.pageFunction).match(/,\s*"(https:\/\/api\.clutch\.ca[^"]+)"\)/)?.[1] ?? "";
        const model = new URL(targetUrl).searchParams.get("models[]") ?? "";
        const clutchBody = JSON.stringify({
          page: 0,
          pageSize: 32,
          totalCount: 1,
          totalPages: 1,
          vehicles: [{ id: 1, year: 2022, make: { name: "Honda" }, model: { name: model } }],
        });
        return new Response(JSON.stringify([{ status: 200, text: clutchBody }]), { status: 200 });
      }
      // Anything else (a local browser launching and navigating) shouldn't
      // happen in this test at all — Apify recovers both blocked models, so
      // the code must return before ever reaching openBrowserSession.
      localBrowserWasLaunched = true;
      return new Response("", { status: 404 });
    });

    await clutch.run(() => {});

    assert.equal(localBrowserWasLaunched, false, "local browser must never be touched when Apify already recovered everything");
  }
);
