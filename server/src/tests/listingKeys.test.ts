import test from "node:test";
import assert from "node:assert/strict";
import { dedupeKeyFor, normalizeListingUrl } from "../util/listingKeys";
import { rekeyListings, withCurrentKeys } from "../db/rekey";
import { SEED_DEDUPE_KEYS } from "../db/seed";
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
  assert.equal(out.collisions, 0);
  assert.equal(out.listings.length, 2);
  out.listings.forEach((l) => assert.match(l.dedupeKey, /^url:/));
});

test("migration never drops a row, even when two want the same key", () => {
  // The same listing stored twice because its price moved between scrapes.
  // The old migration deleted the loser; deleting during a startup migration is
  // how a whole collection gets drained one restart at a time, so now the row
  // simply keeps its existing key and the next upsert reconciles it.
  const older = row({ price: 22998, firstSeenAt: "2026-07-01T00:00:00.000Z" });
  const newer = row({ price: 21998, firstSeenAt: "2026-07-20T00:00:00.000Z" });

  const out = rekeyListings([newer, older]);
  assert.equal(out.listings.length, 2, "no row is ever dropped");
  assert.equal(out.collisions, 1);

  // The older row wins the new key; the newer keeps its old one, untouched.
  const winner = out.listings.find((l) => l.id === older.id)!;
  const deferred = out.listings.find((l) => l.id === newer.id)!;
  assert.match(winner.dedupeKey, /^url:/);
  assert.equal(deferred.dedupeKey, newer.dedupeKey);
});

test("a URL shared by several listings is not used as identity", () => {
  // Clutch handed every id-less vehicle the same /cars URL, and seed rows use
  // bare category pages. Treating a page as a listing fuses distinct cars into
  // one record, so a URL claimed more than once is ignored for identity.
  const shared = "https://www.clutch.ca/cars";
  const a = row({ listingUrl: shared, mileageKm: 10000, id: "lst_a" });
  const b = row({ listingUrl: shared, mileageKm: 90000, id: "lst_b" });
  const c = row({ listingUrl: shared, mileageKm: 50000, id: "lst_c" });

  const out = rekeyListings([a, b, c]);
  assert.equal(out.listings.length, 3);
  const keys = new Set(out.listings.map((l) => l.dedupeKey));
  assert.equal(keys.size, 3, "three different cars stay three records");
  out.listings.forEach((l) => assert.ok(!l.dedupeKey.startsWith("url:"), l.dedupeKey));
});

test("withCurrentKeys ignores a shared URL but keeps genuine per-listing ones", () => {
  const shared = "https://www.clutch.ca/cars";
  const batch = [
    row({ listingUrl: shared, mileageKm: 1000, id: "lst_1" }),
    row({ listingUrl: shared, mileageKm: 2000, id: "lst_2" }),
    row({ listingUrl: "https://www.autotrader.ca/offers/real_one-1", id: "lst_3" }),
  ];
  const out = withCurrentKeys(batch);
  assert.equal(out.length, 3, "no car is merged away");
  assert.equal(new Set(out.map((l) => l.dedupeKey)).size, 3);
  assert.equal(out.filter((l) => l.dedupeKey.startsWith("url:")).length, 1);
});

test("the seed cleanup keys are legacy keys, so they cannot match live rows", () => {
  // Several seed rows use a category page as their listingUrl. Deriving these
  // from the current scheme turned them into url: keys a real listing could
  // share — aiming a deleteMany at live inventory.
  for (const k of SEED_DEDUPE_KEYS) {
    assert.ok(!k.startsWith("url:"), `seed key must not be URL-derived: ${k}`);
  }
});

test("migration is idempotent", () => {
  const once = rekeyListings([row({}), row({ listingUrl: "https://x.ca/a" })]);
  const twice = rekeyListings(once.listings);
  assert.equal(twice.rekeyed, 0);
  assert.equal(twice.listings.length, once.listings.length);
});
