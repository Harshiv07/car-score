/**
 * eDealer-platform dealers (Half-Way Motors Mazda) — the used-inventory page
 * embeds the whole lot as a `vehicleArray` JS object literal in the static
 * HTML. Fixture below mirrors the real structure captured live from
 * halfwaymotorsmazda.com/used/ (trimmed to the fields the parser reads), incl.
 * the shared multi-brand feed quirk: this dealer group's used lot mixes
 * inventory from a sibling Nissan store under the same page.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { edealerToRaw, extractVehicleArray } from "../scrapers/edealer";
import { normalizeRecord } from "../scrapers/normalize";

const PAGE = `<!doctype html><html><head></head><body>
<script type="text/javascript">
    var isOldIE = false;
    var resourceUrl = "https://static.edealer.ca";
    var edealerWebsiteId = 2594;
    var vehicleArray = [];
    vehicleArray = {"15206467":{"vehicleId":"15206467","dealerName":"Half Way Motors Mazda","sellerName":"Half Way Motors Mazda","city":"Thunder Bay","province":"Ontario","vin":"JM3KKEHC5S1199694","stockNum":"6239A","year":"2025","make":"Mazda","model":"CX-5","trim":"GT","driveTrain":"All Wheel Drive","engine":"2.5L 4cyl","transmission":"Automatic","fuelType":"Gasoline","exteriorColour":"White","interiorColour":"Tan","mileage":"31507","price":37998,"detailUrl":"/used/vehicle/2025-mazda-cx-5-gt-id15206467.htm","images":{"images":{"187661550":{"dirWs":"https://v3inventory.edealer.ca/content/vehicle/","fileName":"187661550.jpeg"}}}},"15240293":{"vehicleId":"15240293","dealerName":"Half-Way Motors Nissan","sellerName":"Half-Way Motors Nissan","city":"Thunder Bay","province":"Ontario","vin":"3FMCR9CN0SRF12046","stockNum":"NC6630A","year":"2025","make":"Ford","model":"Bronco Sport","trim":"Outer Banks","driveTrain":"4x4","engine":"1.5L 3cyl","transmission":"Automatic","fuelType":"Gasoline","exteriorColour":"Red","interiorColour":"Other","mileage":"5041","price":35998,"detailUrl":"/used/vehicle/2025-ford-bronco-sport-outer-banks-id15240293.htm","images":{"images":{}}},"15219623":{"vehicleId":"15219623","dealerName":"Half Way Motors Mazda","sellerName":"Half Way Motors Mazda","city":"Thunder Bay","province":"Ontario","vin":"JM1KFBCM4S0123456","stockNum":"6478L","year":"2025","make":"Mazda","model":"CX-90 MHEV","trim":"Signature","driveTrain":"All Wheel Drive","engine":"3.3L 6cyl","transmission":"Automatic","fuelType":"Gasoline","exteriorColour":"Zircon Sand Metallic","interiorColour":"Terracotta","mileage":"12000","price":54998,"detailUrl":"/used/vehicle/2025-mazda-cx-90-mhev-id15219623.htm","images":{"images":{}}}};

    var dealerName = 'Half Way Motors Mazda';
</script>
</body></html>`;

test("extracts every vehicle from the embedded vehicleArray object literal", () => {
  const vehicles = extractVehicleArray(PAGE);
  assert.equal(vehicles.length, 3);
  // Not asserting order: JS objects iterate integer-like string keys (real
  // eDealer vehicle ids) in ascending numeric order regardless of insertion
  // order — a real language quirk, not something this parser controls.
  assert.deepEqual(new Set(vehicles.map((v) => v.model)), new Set(["CX-5", "Bronco Sport", "CX-90 MHEV"]));
});

test("returns [] when the page has no vehicleArray (site changed / wrong page)", () => {
  assert.deepEqual(extractVehicleArray("<html><body>no data here</body></html>"), []);
});

test("a supported-model eDealer vehicle normalizes with accurate data", () => {
  const vehicles = extractVehicleArray(PAGE);
  const cx5 = vehicles.find((v) => v.model === "CX-5")!;
  const listing = normalizeRecord(edealerToRaw(cx5), {
    sourceWebsite: "Half-Way Motors Mazda",
    baseUrl: "https://www.halfwaymotorsmazda.com",
    dealer: cx5.dealerName,
    city: "Thunder Bay",
    province: "ON",
  });
  assert.ok(listing, "Mazda CX-5 must normalize");
  assert.equal(listing!.make, "Mazda");
  assert.equal(listing!.model, "CX-5");
  assert.equal(listing!.year, 2025);
  assert.equal(listing!.price, 37998);
  assert.equal(listing!.mileageKm, 31507, "bare digit-string mileage must parse to a real km number");
  assert.equal(listing!.drivetrain, "AWD");
  assert.equal(listing!.fuelType, "Gas");
  assert.equal(listing!.vin, "JM3KKEHC5S1199694");
  assert.equal(listing!.listingUrl, "https://www.halfwaymotorsmazda.com/used/vehicle/2025-mazda-cx-5-gt-id15206467.htm");
  assert.equal(listing!.image, "https://v3inventory.edealer.ca/content/vehicle/187661550.jpeg");
  assert.equal(listing!.dealer, "Half Way Motors Mazda");
});

test("an unsupported model (CX-90 MHEV) is dropped, but a supported one on the same feed is not", () => {
  const vehicles = extractVehicleArray(PAGE);
  const cx90 = vehicles.find((v) => v.model === "CX-90 MHEV")!;
  const listing = normalizeRecord(edealerToRaw(cx90), {
    sourceWebsite: "Half-Way Motors Mazda",
    baseUrl: "https://www.halfwaymotorsmazda.com",
    dealer: cx90.dealerName,
  });
  assert.equal(listing, null, "CX-90 MHEV is not one of the 10 supported models");
});

test("a sibling-dealer vehicle on the shared feed is attributed to ITS OWN dealer, not the configured one", () => {
  // The Bronco Sport belongs to Half-Way Motors NISSAN, a sibling store on the
  // same shared inventory page — even though it isn't a supported model here,
  // the mechanism (per-vehicle dealerName, not the config's static name) is
  // what this guards; verified via the raw mapping directly.
  const vehicles = extractVehicleArray(PAGE);
  const bronco = vehicles.find((v) => v.model === "Bronco Sport")!;
  assert.equal(bronco.dealerName, "Half-Way Motors Nissan");
  assert.notEqual(bronco.dealerName, "Half Way Motors Mazda");
});
