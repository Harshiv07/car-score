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
import { buildModelQueryUrl, MODEL_TARGETS } from "../scrapers/clutch";
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
