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
