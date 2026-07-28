import test from "node:test";
import assert from "node:assert/strict";
import { dedupeKeyFor, normalizeListingUrl } from "../util/listingKeys";
import { rekeyListings } from "../db/rekey";
import { Listing } from "../types";

const base = {
  vin: null as string | null,
  year: 2022,
  make: "Toyota",
  model: "Corolla",
  trim: "LE",
  dealer: null as string | null,
  listingUrl: "https://www.autotrader.ca/offers/toyota-corolla-le_abc-123",
  mileageKm: 26751,
  city: "Vaughan",
  sourceWebsite: "AutoTrader.ca",
};

/* ---- the bug this scheme exists to fix ---------------------------------- */

test("a price change does not change identity", () => {
  // The old key hashed price, so a price drop produced a brand-new key and the
  // next scrape stored the same car twice.
  const before = dedupeKeyFor({ ...base });
  const after = dedupeKeyFor({ ...base, price: 21998 } as never);
  assert.equal(before, after);
});

test("two different cars at the same price stay distinct", () => {
  // The old key had only year|make|model|trim|price to work with on the ~98% of
  // rows with no dealer, so same-price twins collapsed into one record.
  const a = dedupeKeyFor({ ...base, listingUrl: "https://www.autotrader.ca/offers/x_aaa-111" });
  const b = dedupeKeyFor({ ...base, listingUrl: "https://www.autotrader.ca/offers/x_bbb-222" });
  assert.notEqual(a, b);
});

/* ---- key precedence ------------------------------------------------------ */

test("VIN wins over URL, so one car listed on two sites is one record", () => {
  const onDealerSite = dedupeKeyFor({
    ...base,
    vin: "2T1BURHE0JC014567",
    listingUrl: "https://goremotorshonda.com/listings/2022-toyota-corolla-le/",
  });
  const onAutoTrader = dedupeKeyFor({
    ...base,
    vin: "2t1burhe0jc014567",
    listingUrl: "https://www.autotrader.ca/offers/toyota-corolla_zzz-999",
  });
  assert.equal(onDealerSite, onAutoTrader);
  assert.match(onDealerSite, /^vin:/);
});

test("placeholder VINs fall through to the URL", () => {
  for (const vin of ["00000000000000000", "N/A", "unknown"]) {
    assert.match(dedupeKeyFor({ ...base, vin }), /^url:/, `expected ${vin} to be rejected`);
  }
});

test("a row with neither VIN nor URL still gets a stable key", () => {
  const k = dedupeKeyFor({ ...base, listingUrl: null });
  assert.match(k, /^cmp:/);
  assert.equal(k, dedupeKeyFor({ ...base, listingUrl: null }));
});

test("the fallback key excludes price but uses mileage", () => {
  const a = dedupeKeyFor({ ...base, listingUrl: null, price: 1 } as never);
  const b = dedupeKeyFor({ ...base, listingUrl: null, price: 999999 } as never);
  assert.equal(a, b, "price must not affect identity");

  const c = dedupeKeyFor({ ...base, listingUrl: null, mileageKm: 90000 });
  assert.notEqual(a, c, "mileage must affect identity");
});

/* ---- URL normalization --------------------------------------------------- */

test("normalization ignores noise that does not identify the listing", () => {
  const canonical = "autotrader.ca/offers/toyota-corolla-le_abc-123";
  for (const variant of [
    "https://www.autotrader.ca/offers/toyota-corolla-le_abc-123",
    "https://autotrader.ca/offers/toyota-corolla-le_abc-123/",
    "https://www.AutoTrader.ca/offers/Toyota-Corolla-LE_abc-123?utm_source=x#gallery",
  ]) {
    assert.equal(normalizeListingUrl(variant), canonical, variant);
  }
});

test("Convertus display params are dropped but the stock number is kept", () => {
  // ?sale_class=Used is which tab we happened to follow, not which car it is.
  assert.equal(
    normalizeListingUrl("https://www.waynetoyota.com/vehicles/2020/Toyota/RAV%204/Thunder%20Bay/ON/70431594/?sale_class=Used"),
    "waynetoyota.com/vehicles/2020/toyota/rav 4/thunder bay/on/70431594"
  );
  // Two different stock numbers must not collapse.
  assert.notEqual(
    normalizeListingUrl("https://www.waynetoyota.com/vehicles/2020/Toyota/RAV%204/Thunder%20Bay/ON/70431594/"),
    normalizeListingUrl("https://www.waynetoyota.com/vehicles/2020/Toyota/RAV%204/Thunder%20Bay/ON/70744556/")
  );
});

test("junk URLs are rejected rather than becoming a shared key", () => {
  for (const bad of [null, undefined, "", "not-a-url", "javascript:alert(1)", "ftp://x/y"]) {
    assert.equal(normalizeListingUrl(bad as string | null), null, String(bad));
  }
});

/* ---- migration ----------------------------------------------------------- */

function row(over: Partial<Listing>): Listing {
  return {
    ...base,
    id: "lst_" + Math.random().toString(16).slice(2, 12),
    dedupeKey: "cmp:legacy" + Math.random(),
    title: "2022 Toyota Corolla LE",
    price: 22998,
    drivetrain: "FWD",
    engine: null,
    transmission: null,
    fuelType: "Gas",
    fuelEconomy: null,
    exteriorColour: null,
    interiorColour: null,
    isDealer: false,
    province: "ON",
    image: null,
    cpo: false,
    warrantyMonths: null,
    warrantyNote: null,
    carfaxAvailable: false,
    accidentReported: null,
    recalls: [],
    features: [],
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
    ...over,
  } as Listing;
}

test("migration re-keys legacy rows without duplicating them", () => {
  const stored = [row({}), row({ listingUrl: "https://www.autotrader.ca/offers/other_xyz-9" })];
  const out = rekeyListings(stored);
  assert.equal(out.rekeyed, 2);
  assert.equal(out.merged, 0);
  assert.equal(out.listings.length, 2);
  out.listings.forEach((l) => assert.match(l.dedupeKey, /^url:/));
});

test("migration collapses rows the old key had split on price, keeping the older", () => {
  // The same listing stored twice because its price moved between scrapes.
  const older = row({ price: 22998, firstSeenAt: "2026-07-01T00:00:00.000Z", lastSeenAt: "2026-07-01T00:00:00.000Z" });
  const newer = row({ price: 21998, firstSeenAt: "2026-07-20T00:00:00.000Z", lastSeenAt: "2026-07-20T00:00:00.000Z" });

  const out = rekeyListings([newer, older]);
  assert.equal(out.merged, 1);
  assert.equal(out.listings.length, 1);

  const kept = out.listings[0];
  assert.equal(kept.firstSeenAt, older.firstSeenAt, "keeps the true first-seen date");
  assert.equal(kept.price, 21998, "but takes the fresher price");
  assert.deepEqual(out.removedIds, [newer.id]);
});

test("migration is idempotent", () => {
  const once = rekeyListings([row({}), row({ listingUrl: "https://x.ca/a" })]);
  const twice = rekeyListings(once.listings);
  assert.equal(twice.rekeyed, 0);
  assert.equal(twice.merged, 0);
  assert.equal(twice.listings.length, once.listings.length);
});
