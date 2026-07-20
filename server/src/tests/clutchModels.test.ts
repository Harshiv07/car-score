/**
 * Clutch is queried as ONE combined request listing all 5 makes + all 10
 * supported models; the API returns a mix of every model on each page, so one
 * paginated query covers all models even though the WAF only allows ~5 pages
 * before challenging. Verified live: the combined query returns totalCount≈778
 * spanning every supported model.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAllModelsQueryUrl, clutch, MODEL_TARGETS } from "../scrapers/clutch";
import { VEHICLE_MODELS } from "../data/vehicleModels";

// No browser tier in unit tests: a WAF-blocked page would otherwise trigger a
// real Chromium launch (see crawl.ts's openBrowserSession), making the test
// slow + network-dependent. That path is verified live, not here.
process.env.SCRAPE_JS_FALLBACK = "0";

test("MODEL_TARGETS mirrors the scored models", () => {
  assert.equal(MODEL_TARGETS.length, VEHICLE_MODELS.length);
  assert.ok(MODEL_TARGETS.some((t) => t.make === "Mazda" && t.model === "CX-5"));
  assert.ok(MODEL_TARGETS.some((t) => t.make === "Mazda" && t.model === "Mazda3"));
  assert.ok(MODEL_TARGETS.some((t) => t.make === "Subaru" && t.model === "Forester"));
});

test("the combined query lists all 5 makes + 10 models in one request", () => {
  const params = new URL(buildAllModelsQueryUrl(0)).searchParams;
  assert.deepEqual([...new Set(params.getAll("makes[]"))].sort(), ["Honda", "Hyundai", "Mazda", "Subaru", "Toyota"]);
  assert.equal(params.getAll("models[]").length, 10);
  assert.ok(params.getAll("models[]").includes("CX-5"));
  assert.ok(params.getAll("models[]").includes("Crosstrek"));
  assert.equal(params.get("page"), "0");
  assert.equal(new URL(buildAllModelsQueryUrl(4)).searchParams.get("page"), "4");
});

test("the combined query sends exactly the params a real clutch.ca session sends — nothing extra", () => {
  // Regression: a stray non-standard param (e.g. a custom page size) is a
  // request shape no real browser produces, which is exactly what the WAF flags.
  const params = new URL(buildAllModelsQueryUrl(0)).searchParams;
  assert.deepEqual(
    [...new Set(params.keys())].sort(),
    ["downPayment", "interestRate", "isBiweekly", "makes[]", "models[]", "page"].sort()
  );
});

test(
  "paginates until the WAF challenges, keeps what it got, and covers every model (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Each page returns a MIX of models (how the real combined query behaves).
    // Pages 0-1 succeed spanning all 10 models between them; page 2 is a 202
    // WAF challenge → stop and keep pages 0-1.
    const pagesFetched: number[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const page = Number(new URL(input).searchParams.get("page"));
      pagesFetched.push(page);
      if (page >= 2) return new Response("", { status: 202 }); // WAF challenge, not "no results"
      const models = MODEL_TARGETS.slice(page * 5, page * 5 + 5); // pages 0,1 → all 10 models
      return new Response(
        JSON.stringify({
          page,
          pageSize: 32,
          totalCount: 320,
          totalPages: 10,
          vehicles: models.map((m, i) => ({
            id: page * 100 + i,
            year: 2022,
            make: { name: m.make },
            model: { name: m.model },
            ["vehiclePrice-ON"]: { price: 20000 + i },
          })),
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const result = await clutch.run(() => {});

    assert.deepEqual(pagesFetched, [0, 1, 2], "stops at the first WAF-challenged page (2), after keeping 0-1");
    const models = new Set(result.listings.map((l) => `${l.make} ${l.model}`));
    assert.equal(models.size, 10, "every supported model must appear — the combined query mixes them across pages");
    assert.equal(result.listings.length, 10);
  }
);
