/**
 * CarGurus.ca via Scrapfly — network-independent. The fixture below mirrors
 * the real `window.__remixContext` structure captured live from
 * cargurus.ca's current Remix-based search page (verified: 89 real, accurate
 * listings fetched for 4 models before the test Scrapfly account's quota ran
 * out from this session's discovery + verification work — see git history).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cargurusTileToRaw, extractRemixSearch, fetchViaScrapfly, MODEL_PATHS, scrapflyConfigured } from "../scrapers/cargurus";
import { normalizeRecord } from "../scrapers/normalize";
import { VEHICLE_MODELS } from "../data/vehicleModels";

const TILE_JSON = JSON.stringify({
  id: 449331565,
  vin: "2T3R1RFV2LC102476",
  listingTitle: "2021 Toyota RAV4 Trail AWD",
  localizedDrivetrain: "All-Wheel Drive",
  localizedEngineName: "2.5L I4",
  localizedTransmission: "Automatic",
  mileageData: { value: 74218, unit: "KILOMETERS" },
  priceData: { current: 36488, localizedPrice: "$36,488" },
  exteriorColorData: { name: "Silver", localized: "Silver" },
  pictureData: { url: "https://static.cargurus.com/images/forsale/2026/pic.jpeg" },
  ontologyData: { makeName: "Toyota", modelName: "RAV4", trimName: "Trail", carYear: 2021 },
  sellerData: { city: "Thunder Bay", region: "ON", serviceProviderName: "Mark Wilson's Better Used Cars" },
});

const PAGE = `<!doctype html><html><head></head><body>
<script>window.__remixContext = {"state":{"loaderData":{"root":{},"routes/($intl).search":{"search":{"pageCount":8,"totalListings":190,"tiles":[{"type":"LISTING_USED_PRIORITY","data":${TILE_JSON}},{"type":"SrpAds","data":{}}]}}}}};</script>
</body></html>`;

test("MODEL_PATHS covers every supported model with a resolved CarGurus filter path", () => {
  for (const m of VEHICLE_MODELS) {
    const key = `${m.make} ${m.model}`;
    assert.ok(key in MODEL_PATHS, `${key} must have a resolved makeModelTrimPaths entry`);
    assert.match(MODEL_PATHS[key], /^m\d+\/d\d+$/, `${key}'s path must look like "m<id>/d<id>"`);
  }
});

test("extractRemixSearch pulls tiles/pageCount/totalListings out of the embedded context", () => {
  const search = extractRemixSearch(PAGE);
  assert.ok(search);
  assert.equal(search!.tiles.length, 2, "both the listing tile and the ad placeholder are present");
  assert.equal(search!.pageCount, 8);
  assert.equal(search!.totalListings, 190);
});

test("extractRemixSearch returns null when the page has no remixContext (site changed / challenge page)", () => {
  assert.equal(extractRemixSearch("<html><body>blocked</body></html>"), null);
});

test("cargurusTileToRaw maps a real tile to accurate raw fields", () => {
  const search = extractRemixSearch(PAGE)!;
  const raw = cargurusTileToRaw(search.tiles[0]);
  assert.ok(raw);
  assert.equal(raw!.make, "Toyota");
  assert.equal(raw!.model, "RAV4");
  assert.equal(raw!.trim, "Trail");
  assert.equal(raw!.year, 2021);
  assert.equal(raw!.price, 36488);
  assert.equal(raw!.km, 74218);
  assert.equal(raw!.vin, "2T3R1RFV2LC102476");
  assert.equal(raw!.url, "https://www.cargurus.ca/details/449331565");
  assert.equal(raw!.image, "https://static.cargurus.com/images/forsale/2026/pic.jpeg");
});

test("cargurusTileToRaw returns null for a non-listing tile (ads/placeholders with no data.id)", () => {
  const search = extractRemixSearch(PAGE)!;
  assert.equal(cargurusTileToRaw(search.tiles[1]), null);
});

test("a mapped tile normalizes end-to-end into an accurate, supported-model Listing", () => {
  const search = extractRemixSearch(PAGE)!;
  const raw = cargurusTileToRaw(search.tiles[0])!;
  const listing = normalizeRecord(raw, {
    sourceWebsite: "CarGurus.ca",
    baseUrl: "https://www.cargurus.ca",
    dealer: "Mark Wilson's Better Used Cars",
    city: "Thunder Bay",
    province: "ON",
  });
  assert.ok(listing);
  assert.equal(listing!.make, "Toyota");
  assert.equal(listing!.model, "RAV4");
  assert.equal(listing!.year, 2021);
  assert.equal(listing!.price, 36488);
  assert.equal(listing!.mileageKm, 74218);
  assert.equal(listing!.drivetrain, "AWD");
  assert.equal(listing!.dealer, "Mark Wilson's Better Used Cars");
  assert.equal(listing!.isDealer, true);
});

test("scrapflyConfigured reflects SCRAPFLY_API_KEY", () => {
  const original = process.env.SCRAPFLY_API_KEY;
  delete process.env.SCRAPFLY_API_KEY;
  assert.equal(scrapflyConfigured(), false);
  process.env.SCRAPFLY_API_KEY = "scp-test-key";
  assert.equal(scrapflyConfigured(), true);
  if (original === undefined) delete process.env.SCRAPFLY_API_KEY;
  else process.env.SCRAPFLY_API_KEY = original;
});

test("fetchViaScrapfly reports the reason on failure, not just that it failed", async (t) => {
  delete process.env.SCRAPFLY_API_KEY;
  const unset = await fetchViaScrapfly("https://example.com", 5000);
  assert.equal(unset.html, null);
  assert.match(unset.failureReason ?? "", /not set/);

  process.env.SCRAPFLY_API_KEY = "scp-test-key";
  t.mock.method(globalThis, "fetch", async () =>
    new Response(
      JSON.stringify({ result: { error: { code: "ERR::SCRAPE::QUOTA_LIMIT_REACHED", http_code: 429 } } }),
      { status: 429 }
    )
  );
  const quotaFail = await fetchViaScrapfly("https://example.com", 5000);
  assert.equal(quotaFail.html, null);
  assert.match(quotaFail.failureReason ?? "", /HTTP 429/);
  assert.match(quotaFail.failureReason ?? "", /QUOTA_LIMIT_REACHED/);
  delete process.env.SCRAPFLY_API_KEY;
});

test("fetchViaScrapfly returns the HTML on a real success", async (t) => {
  process.env.SCRAPFLY_API_KEY = "scp-test-key";
  t.mock.method(globalThis, "fetch", async () => new Response(PAGE + "x".repeat(2000), { status: 200 }));
  const result = await fetchViaScrapfly("https://example.com", 5000);
  assert.ok(result.html);
  assert.ok(result.html!.includes("__remixContext"));
  delete process.env.SCRAPFLY_API_KEY;
});
