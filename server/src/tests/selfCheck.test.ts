/**
 * The self-check is the mechanism the app and CLI use to confirm the scraper
 * pipeline works. These tests guard the guard.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPipeline } from "../services/selfCheck";
import { clutchToRaw } from "../scrapers/clutch";
import { normalizeRecord } from "../scrapers/normalize";

test("pipeline self-check passes on healthy code", () => {
  const report = verifyPipeline();
  for (const step of report.steps) {
    assert.ok(step.ok, `step "${step.name}" failed: ${step.detail}`);
  }
  assert.equal(report.ok, true);
});

test("Clutch API vehicle maps to an accurate, non-empty listing", () => {
  const raw = clutchToRaw({
    year: 2023,
    mileage: 33210,
    make: { name: "Subaru" },
    model: { name: "Crosstrek" },
    trim: { name: "Touring" },
    drivetrain: { name: "AWD" },
    fuelType: { name: "Gasoline" },
    cardPhotoUrl: "https://img.clutch.ca/y.jpg",
    ["vehiclePrice-ON"]: { price: 31490 },
  });
  const listing = normalizeRecord(raw, {
    sourceWebsite: "Clutch.ca",
    baseUrl: "https://www.clutch.ca",
    dealer: "Clutch",
    province: "ON",
  });
  assert.ok(listing, "supported model must normalize");
  assert.equal(listing!.make, "Subaru");
  assert.equal(listing!.model, "Crosstrek");
  assert.equal(listing!.year, 2023);
  assert.equal(listing!.price, 31490);
  assert.equal(listing!.mileageKm, 33210);
  assert.equal(listing!.drivetrain, "AWD");
  assert.equal(listing!.isDealer, true);
  assert.match(listing!.listingUrl ?? "", /clutch\.ca\/cars\/2023-subaru-crosstrek/);
});

test("Clutch mapping drops unsupported models", () => {
  const raw = clutchToRaw({
    year: 2022,
    mileage: 40000,
    make: { name: "BMW" },
    model: { name: "X3" },
    ["vehiclePrice-ON"]: { price: 39990 },
  });
  const listing = normalizeRecord(raw, { sourceWebsite: "Clutch.ca", baseUrl: "https://www.clutch.ca" });
  assert.equal(listing, null);
});
