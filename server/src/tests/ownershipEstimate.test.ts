/**
 * ownershipEstimate() used to apply one flat insurance formula
 * (`2600 - tier*220`) to every listing regardless of province, so a Quebec
 * and an identically-scored Ontario listing showed the same "Running costs"
 * insurance line despite a real ~2x gap between the two provinces. These
 * tests guard the province-aware replacement: ON/QC/MB should differ
 * meaningfully, an unrecognized/missing province should fall back sensibly
 * rather than crash or silently pick one province's rate, and the
 * per-model insuranceTier should still move the number within a province.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ownershipEstimate } from "../services/listingService";
import { Listing } from "../types";

/** Minimal, valid Listing fixture. Only `make`/`model`/`province` vary per test. */
function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "test-id",
    dedupeKey: "test-dedupe",
    title: "2021 Toyota RAV4 XLE AWD",
    make: "Toyota",
    model: "RAV4",
    trim: "XLE",
    year: 2021,
    drivetrain: "AWD",
    engine: null,
    transmission: null,
    fuelType: "Gas",
    vin: null,
    price: 30000,
    mileageKm: 40000,
    fuelEconomy: null,
    exteriorColour: null,
    interiorColour: null,
    dealer: null,
    isDealer: true,
    city: null,
    province: "ON",
    sourceWebsite: "Test Source",
    listingUrl: null,
    image: null,
    cpo: false,
    warrantyMonths: null,
    warrantyNote: null,
    carfaxAvailable: false,
    accidentReported: null,
    recalls: [],
    features: [],
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

test("unsupported model returns null (no vehicle knowledge base entry)", () => {
  const l = makeListing({ make: "Yugo", model: "GV" });
  assert.equal(ownershipEstimate(l), null);
});

test("Ontario, Quebec and Manitoba give meaningfully different insurance figures for the same model", () => {
  const on = ownershipEstimate(makeListing({ province: "ON" }));
  const qc = ownershipEstimate(makeListing({ province: "QC" }));
  const mb = ownershipEstimate(makeListing({ province: "MB" }));

  assert.ok(on && qc && mb, "all three should resolve a known model");

  // Real-world spread is roughly 2x between Ontario and Quebec (see the
  // sourcing comment on INSURANCE_BASE_BY_PROVINCE in listingService.ts) —
  // assert the ordering and a substantial gap, not exact dollar amounts, so
  // this doesn't pin down figures that may be revised as sources are.
  assert.ok(on!.insuranceAnnual > mb!.insuranceAnnual, "Ontario should be pricier than Manitoba");
  assert.ok(mb!.insuranceAnnual > qc!.insuranceAnnual, "Manitoba should be pricier than Quebec");
  assert.ok(
    on!.insuranceAnnual > qc!.insuranceAnnual * 1.5,
    "Ontario vs Quebec should reflect a substantial (not rounding-noise) real-world gap"
  );

  // Other cost lines are province-independent — only insurance should move.
  assert.equal(on!.fuelAnnual, qc!.fuelAnnual);
  assert.equal(on!.maintenanceAnnual, qc!.maintenanceAnnual);

  // The province used is surfaced for the UI footnote, additively.
  assert.equal(on!.assumptions.insuranceProvince, "Ontario");
  assert.equal(qc!.assumptions.insuranceProvince, "Quebec");
  assert.equal(mb!.assumptions.insuranceProvince, "Manitoba");
});

test("a null province falls back to the ON/QC/MB average rather than crashing or guessing one province", () => {
  const withNull = ownershipEstimate(makeListing({ province: null }));
  const on = ownershipEstimate(makeListing({ province: "ON" }));
  const qc = ownershipEstimate(makeListing({ province: "QC" }));

  assert.ok(withNull);
  assert.equal(withNull!.assumptions.insuranceProvince, "ON/QC/MB");
  // Falls strictly between the cheapest and priciest supported province —
  // not equal to either, and not some unrelated/zero value.
  assert.ok(withNull!.insuranceAnnual < on!.insuranceAnnual);
  assert.ok(withNull!.insuranceAnnual > qc!.insuranceAnnual);
});

test("an empty string or unrecognized province code also falls back sensibly", () => {
  const empty = ownershipEstimate(makeListing({ province: "" }));
  const unknown = ownershipEstimate(makeListing({ province: "XX" }));
  const withNull = ownershipEstimate(makeListing({ province: null }));

  assert.ok(empty && unknown && withNull);
  assert.equal(empty!.insuranceAnnual, withNull!.insuranceAnnual);
  assert.equal(unknown!.insuranceAnnual, withNull!.insuranceAnnual);
});

test("province matching is case-insensitive", () => {
  const upper = ownershipEstimate(makeListing({ province: "QC" }));
  const lower = ownershipEstimate(makeListing({ province: "qc" }));
  assert.ok(upper && lower);
  assert.equal(upper!.insuranceAnnual, lower!.insuranceAnnual);
});

test("insuranceTier still has a visible effect within a single province", () => {
  // RAV4 is insuranceTier 5 (cheapest) in the knowledge base, Civic is
  // tier 4 — one step pricier. Same province, so any difference is purely
  // the tier adjustment, not the province base.
  const rav4 = ownershipEstimate(makeListing({ make: "Toyota", model: "RAV4", province: "ON" }));
  const civic = ownershipEstimate(makeListing({ make: "Honda", model: "Civic", province: "ON" }));
  assert.ok(rav4 && civic);

  assert.ok(
    civic!.insuranceAnnual > rav4!.insuranceAnnual,
    "a pricier-to-insure tier should cost more than a cheaper tier in the same province"
  );

  // Pins the documented formula (tier 3 = province base; ±10% per tier
  // step) against the sourced Ontario base of $2,000/yr: tier 5 -> *0.8,
  // tier 4 -> *0.9.
  assert.equal(rav4!.insuranceAnnual, 1600);
  assert.equal(civic!.insuranceAnnual, 1800);
});
