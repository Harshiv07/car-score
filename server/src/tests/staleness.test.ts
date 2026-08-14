import test from "node:test";
import assert from "node:assert/strict";
import { isStale, filterActive } from "../services/listingService";
import { Listing, ScoredListing, ScoreResult } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

let counter = 0;
function makeListing(overrides: Partial<Listing> = {}): Listing {
  counter++;
  return {
    id: `lst_test_${counter}`,
    dedupeKey: `url:test.example.com/car-${counter}`,
    title: "2021 Toyota RAV4 LE",
    make: "Toyota",
    model: "RAV4",
    trim: "LE",
    year: 2021,
    drivetrain: "AWD",
    engine: null,
    transmission: null,
    fuelType: "Gas",
    vin: null,
    price: 25000,
    mileageKm: 50000,
    fuelEconomy: null,
    exteriorColour: null,
    interiorColour: null,
    dealer: "Test Motors",
    isDealer: true,
    city: "Toronto",
    province: "ON",
    sourceWebsite: "AutoTrader.ca",
    listingUrl: `https://test.example.com/car-${counter}`,
    image: null,
    cpo: false,
    warrantyMonths: null,
    warrantyNote: null,
    carfaxAvailable: false,
    accidentReported: null,
    recalls: [],
    features: [],
    firstSeenAt: daysAgo(30),
    lastSeenAt: daysAgo(0),
    ...overrides,
  };
}

const FAKE_SCORE: ScoreResult = {
  total: 80,
  breakdown: [],
  market: { marketPrice: 25000, listingPrice: 25000, savings: 0, sampleSize: 1, method: "baseline" },
  dealRating: "Good Deal",
  knownIssues: [],
  pros: [],
  cons: [],
};

function makeScored(overrides: Partial<Listing> = {}): ScoredListing {
  return { ...makeListing(overrides), score: FAKE_SCORE, badges: [], stale: false };
}

test("isStale: false for a listing seen moments ago", () => {
  assert.equal(isStale(makeListing({ lastSeenAt: daysAgo(0) })), false);
});

test("isStale: false just under the 5-day threshold", () => {
  assert.equal(isStale(makeListing({ lastSeenAt: daysAgo(4.9) })), false);
});

test("isStale: true just over the 5-day threshold", () => {
  assert.equal(isStale(makeListing({ lastSeenAt: daysAgo(5.1) })), true);
});

test("isStale: true for a listing unseen for weeks", () => {
  assert.equal(isStale(makeListing({ lastSeenAt: daysAgo(17) })), true);
});

test("isStale: never hides on a malformed or missing timestamp", () => {
  assert.equal(isStale(makeListing({ lastSeenAt: "" })), false);
  assert.equal(isStale(makeListing({ lastSeenAt: "not-a-date" })), false);
});

test("filterActive: drops stale listings, keeps fresh ones", () => {
  const fresh = makeScored({ lastSeenAt: daysAgo(1) });
  const stale = makeScored({ lastSeenAt: daysAgo(20) });
  const result = filterActive([fresh, stale]);
  assert.deepEqual(
    result.map((l) => l.id),
    [fresh.id]
  );
});

/**
 * The property that matters most: a specific-key lookup (favourites) must
 * resolve a stale listing, never silently drop it. FavoritesPage prunes any
 * saved key that a `?keys=` lookup doesn't return — filtering staleness
 * upstream of that lookup would permanently delete a user's saved car from
 * localStorage the moment it went stale, which is the expected, common case
 * for something bookmarked weeks ago. This mirrors the exact selection the
 * /api/listings route makes (see listings.ts): `keys ? all.filter(...) :
 * filterActive(all)`.
 */
test("a keyed lookup resolves a stale listing that discovery would hide", () => {
  const fresh = makeScored({ lastSeenAt: daysAgo(1) });
  const staleFavourite = makeScored({ lastSeenAt: daysAgo(20) });
  const all = [fresh, staleFavourite];

  const discovery = filterActive(all);
  assert.deepEqual(
    discovery.map((l) => l.id),
    [fresh.id],
    "discovery should hide the stale listing"
  );

  const keys = [staleFavourite.dedupeKey];
  const keyed = all.filter((l) => keys.includes(l.dedupeKey));
  assert.deepEqual(
    keyed.map((l) => l.id),
    [staleFavourite.id],
    "a keyed lookup must still resolve the stale favourite"
  );
});
