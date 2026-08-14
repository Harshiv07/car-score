import { test } from "node:test";
import assert from "node:assert/strict";
import { evapEligibility } from "../data/evapEligibility";

test("returns null for anything that isn't Electric — including Hybrid, since the schema can't tell a PHEV from a regular hybrid", () => {
  assert.equal(evapEligibility({ fuelType: "Gas", price: 30000, make: "Toyota" }), null);
  assert.equal(evapEligibility({ fuelType: "Hybrid", price: 30000, make: "Toyota" }), null);
  assert.equal(evapEligibility({ fuelType: "Diesel", price: 30000, make: "Ford" }), null);
  assert.equal(evapEligibility({ fuelType: "Unknown", price: 30000, make: "Kia" }), null);
});

test("eligible: Electric, under the price cap, built by a free-trade-country make", () => {
  const r = evapEligibility({ fuelType: "Electric", price: 45000, make: "Hyundai" });
  assert.ok(r);
  assert.equal(r!.eligible, true);
  assert.equal(r!.rebateAmount, 5000);
  assert.match(r!.reason, /5,000/);
});

test("price exactly at the $50,000 cap still qualifies", () => {
  const r = evapEligibility({ fuelType: "Electric", price: 50000, make: "Ford" });
  assert.ok(r);
  assert.equal(r!.eligible, true);
});

test("ineligible: over the $50,000 pre-tax price cap", () => {
  const r = evapEligibility({ fuelType: "Electric", price: 50001, make: "Ford" });
  assert.ok(r);
  assert.equal(r!.eligible, false);
  assert.equal(r!.rebateAmount, 0);
  assert.match(r!.reason, /50,000/);
});

test("ineligible: known Chinese EV brand, even under the price cap", () => {
  const r = evapEligibility({ fuelType: "Electric", price: 35000, make: "BYD" });
  assert.ok(r);
  assert.equal(r!.eligible, false);
  assert.equal(r!.rebateAmount, 0);
});

test("make matching is case-insensitive", () => {
  const r = evapEligibility({ fuelType: "Electric", price: 35000, make: "byd" });
  assert.equal(r!.eligible, false);
  const r2 = evapEligibility({ fuelType: "Electric", price: 35000, make: "TOYOTA" });
  assert.equal(r2!.eligible, true);
});

test("ineligible: make not on the free-trade allow-list reads as unverified, not a false yes", () => {
  // Tesla is deliberately excluded from the allow-list because its Canadian
  // market is supplied from both a US and a China plant, and this make-level
  // check can't tell which one built a given listing.
  const r = evapEligibility({ fuelType: "Electric", price: 45000, make: "Tesla" });
  assert.ok(r);
  assert.equal(r!.eligible, false);
  assert.equal(r!.rebateAmount, 0);
  assert.match(r!.reason, /government/);
});
