/**
 * The new-car catalog is a reviewed data file, so its tests are the review's
 * safety net: the shipped file must be valid, and the validator must refuse the
 * mistakes that would put a wrong price in front of a buyer.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import raw from "../data/newCars.json";
import { buildCatalog, getNewCars } from "../newcars/catalog";

const base = () => JSON.parse(JSON.stringify(raw)) as Record<string, any>;

test("the shipped file is valid and every model has what the page needs", () => {
  const { cars, pricesAsOf } = buildCatalog(raw);
  assert.ok(cars.length >= 20, "a useful lineup, not a stub");
  assert.match(pricesAsOf, /^\d{4}-\d{2}-\d{2}$/);
  for (const c of cars) {
    assert.ok(c.officialUrl.startsWith("https://"), `${c.id} links to an official site`);
    assert.ok(c.priceSource.length > 3, `${c.id} says where its prices came from`);
  }
});

test("the link label source is the brand, not the price provenance", () => {
  for (const c of buildCatalog(raw).cars) assert.equal(c.source, `${c.make} Canada`);
});

test("ids are unique and derived from make and model", () => {
  const { cars } = buildCatalog(raw);
  assert.equal(new Set(cars.map((c) => c.id)).size, cars.length);
  assert.ok(cars.some((c) => c.id === "toyota-rav4"));
  assert.ok(cars.some((c) => c.id === "toyota-rav4-plug-in-hybrid"));
});

test("starting price is the cheapest confirmed trim, never a guess", () => {
  const { cars } = buildCatalog(raw);
  const rav4 = cars.find((c) => c.id === "toyota-rav4")!;
  assert.equal(rav4.startingPriceCad, 37500);
  for (const c of cars) {
    const priced = c.trims.map((t) => t.priceCad).filter((p): p is number => p != null);
    assert.equal(c.startingPriceCad, priced.length ? Math.min(...priced) : null, `${c.id}`);
  }
});

test("a model with no confirmed price is kept, with a null price, not dropped or invented", () => {
  const civic = buildCatalog(raw).cars.find((c) => c.id === "honda-civic")!;
  assert.ok(civic);
  assert.equal(civic.startingPriceCad, null);
  assert.deepEqual(civic.trims, []);
});

test("trims are listed cheapest first, with unpriced ones last", () => {
  for (const c of buildCatalog(raw).cars) {
    const prices = c.trims.map((t) => t.priceCad ?? Infinity);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), c.id);
  }
});

test("fuels and drivetrains are derived from the trims", () => {
  const camry = buildCatalog(raw).cars.find((c) => c.id === "toyota-camry")!;
  assert.deepEqual(camry.fuels, ["Hybrid"]);
  assert.deepEqual(camry.drivetrains.sort(), ["AWD", "FWD"]);
  const tucson = buildCatalog(raw).cars.find((c) => c.id === "hyundai-tucson")!;
  assert.deepEqual(tucson.fuels, ["Gas", "Hybrid", "Plug-in hybrid"]);
});

test("best stated fuel economy is surfaced only where a source gave one", () => {
  const { cars } = buildCatalog(raw);
  assert.equal(cars.find((c) => c.id === "honda-accord")!.fuelEconomyL100, 5.3);
  assert.equal(cars.find((c) => c.id === "toyota-corolla")!.fuelEconomyL100, null);
});

test("a price that looks like a typo is refused", () => {
  for (const bad of [375, 3_750_000, 37500.5, "37500"]) {
    const f = base();
    f.models[0].trims[0].priceCad = bad;
    assert.throws(() => buildCatalog(f), /priceCad/, `${String(bad)} must be refused`);
  }
});

test("a US-style or malformed record is refused", () => {
  const noUrl = base();
  noUrl.models[0].officialUrl = "http://insecure.example";
  assert.throws(() => buildCatalog(noUrl), /https/);

  const badFuel = base();
  badFuel.models[0].trims[0].powertrain = "Diesel";
  assert.throws(() => buildCatalog(badFuel), /powertrain/);

  const badDate = base();
  badDate.pricesAsOf = "last Tuesday";
  assert.throws(() => buildCatalog(badDate), /pricesAsOf/);

  const usd = base();
  usd.currency = "USD";
  assert.throws(() => buildCatalog(usd), /CAD/);
});

test("duplicate models and duplicate trims are refused", () => {
  const dupModel = base();
  dupModel.models.push(JSON.parse(JSON.stringify(dupModel.models[0])));
  assert.throws(() => buildCatalog(dupModel), /duplicate model/);

  const dupTrim = base();
  dupTrim.models[0].trims.push({ ...dupTrim.models[0].trims[0] });
  assert.throws(() => buildCatalog(dupTrim), /duplicate trim/);
});

test("the API result is instant, never loading, and dated", () => {
  const r = getNewCars();
  assert.equal(r.loading, false);
  assert.ok(r.cars.length > 0);
  assert.equal(r.pricesAsOf, raw.pricesAsOf);
  assert.ok(!Number.isNaN(Date.parse(r.fetchedAt)));
});

test("makes are grouped alphabetically", () => {
  const makes = buildCatalog(raw).cars.map((c) => c.make);
  assert.deepEqual(makes, [...makes].sort((a, b) => a.localeCompare(b)));
});
