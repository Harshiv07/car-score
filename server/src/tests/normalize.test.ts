import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRecord, parseKm, inferDrivetrain } from "../scrapers/normalize";
import { dedupeKeyFor } from "../util/listingKeys";
import { NormalizeMeta } from "../scrapers/normalize";

const META: NormalizeMeta = {
  sourceWebsite: "Test Source",
  baseUrl: "https://dealer.example.com",
  dealer: "Test Dealer",
  city: "Thunder Bay",
  province: "ON",
};

test("normalizes a supported model with relative URL and CPO detection", () => {
  const l = normalizeRecord(
    {
      title: "2020 Toyota RAV4 XLE AWD - Certified Pre-Owned",
      price: "25,988",
      km: "88,000 km",
      url: "/vehicles/2020-toyota-rav4/",
      vin: "2T3P1RFV8LC081989",
    },
    META
  );
  assert.ok(l, "listing should not be dropped");
  assert.equal(l.make, "Toyota");
  assert.equal(l.model, "RAV4");
  assert.equal(l.year, 2020);
  assert.equal(l.price, 25988);
  assert.equal(l.mileageKm, 88000);
  assert.equal(l.drivetrain, "AWD");
  assert.equal(l.cpo, true);
  assert.equal(l.listingUrl, "https://dealer.example.com/vehicles/2020-toyota-rav4/");
  assert.equal(l.sourceWebsite, "Test Source");
});

test("drops unsupported models and junk records", () => {
  assert.equal(normalizeRecord({ title: "2020 Ford Escape SE", price: 21000 }, META), null);
  assert.equal(normalizeRecord({ title: "2020 Toyota RAV4" /* no price */ }, META), null);
  assert.equal(normalizeRecord({ title: "Toyota RAV4 floor mats", price: 150 }, META), null);
});

test("km and drivetrain parsing are forgiving", () => {
  assert.equal(parseKm("89,482 km"), 89482);
  assert.equal(parseKm(120000), 120000);
  assert.equal(parseKm("call for details"), null);
  assert.equal(inferDrivetrain("i-ACTIV all-wheel drive"), "AWD");
  assert.equal(inferDrivetrain("FWD 6-speed"), "FWD");
  assert.equal(inferDrivetrain(undefined), "Unknown");
});

test("dedupe key: VIN wins, then the listing URL, then a composite", () => {
  // Price is deliberately no longer part of identity — see util/listingKeys.ts
  // and tests/listingKeys.test.ts for why. This test previously asserted the
  // opposite ("different price → different key"), which is the behaviour that
  // duplicated a car every time its asking price moved.
  const vinKey = dedupeKeyFor({
    vin: "2T3P1RFV8LC081989", year: 2020, make: "Toyota", model: "RAV4",
    trim: "XLE", dealer: "A",
  });
  assert.ok(vinKey.startsWith("vin:"));

  const urlKey = dedupeKeyFor({
    vin: null, year: 2020, make: "Toyota", model: "RAV4", trim: "XLE", dealer: "A",
    listingUrl: "https://www.autotrader.ca/offers/toyota-rav4_abc-1",
  });
  assert.ok(urlKey.startsWith("url:"));

  const a = dedupeKeyFor({ vin: null, year: 2020, make: "Toyota", model: "RAV4", trim: "XLE", dealer: "A" });
  const b = dedupeKeyFor({ vin: null, year: 2020, make: "toyota", model: "rav4", trim: "xle", dealer: "a" });
  const c = dedupeKeyFor({ vin: null, year: 2020, make: "Toyota", model: "RAV4", trim: "XLE", dealer: "B" });
  assert.equal(a, b, "composite key is case-insensitive");
  assert.notEqual(a, c, "different dealer → different key");
});
