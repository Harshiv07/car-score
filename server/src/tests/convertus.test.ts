/**
 * Convertus VMS mapping (network-independent). Guards the field mapping that
 * turns a dealer's Convertus API vehicle into a scored listing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { convertusToRaw } from "../scrapers/convertus";
import { normalizeRecord } from "../scrapers/normalize";

// A real-shaped Superior Hyundai vehicle.
const VEHICLE = {
  vin: "KM8JDDA20NU043832",
  year: 2022,
  make: "Hyundai",
  model: "TUCSON",
  trim: "AWD 2.0L Ultimate",
  search_trim: "Ultimate",
  drive_train: "All Wheel Drive",
  engine: "4 Cylinder Engine",
  fuel_type: "Gas",
  transmission: "Automatic",
  exterior_color: "Black",
  odometer: 74132,
  initial_price: 29735,
  final_price: 29735,
  vdp_url: "https://www.superiorhyundai.ca//vehicles/2022/Hyundai/TUCSON/Thunder Bay/ON/65422029/?sale_class=Used",
  image: { image_original: "https://img.example/x.jpg" },
};

test("Convertus vehicle maps to an accurate supported listing", () => {
  const listing = normalizeRecord(convertusToRaw(VEHICLE), {
    sourceWebsite: "Superior Hyundai",
    baseUrl: "https://www.superiorhyundai.ca",
    dealer: "Superior Hyundai",
    city: "Thunder Bay",
    province: "ON",
  });
  assert.ok(listing, "supported model must normalize");
  assert.equal(listing!.make, "Hyundai");
  assert.equal(listing!.model, "Tucson");
  assert.equal(listing!.year, 2022);
  assert.equal(listing!.price, 29735);
  assert.equal(listing!.mileageKm, 74132);
  assert.equal(listing!.drivetrain, "AWD");
  assert.equal(listing!.vin, "KM8JDDA20NU043832");
  assert.equal(listing!.isDealer, true);
  assert.equal(listing!.city, "Thunder Bay");
  // The doubled slash in vdp_url must be tidied (but not the https:// one).
  assert.ok(!/[^:]\/\//.test(listing!.listingUrl ?? ""), "no stray // in the URL");
  assert.match(listing!.listingUrl ?? "", /^https:\/\/www\.superiorhyundai\.ca\//);
});

test("Convertus mapping drops unsupported makes", () => {
  const raw = convertusToRaw({ year: 2021, make: "RAM", model: "1500", final_price: 45000, odometer: 60000 });
  const listing = normalizeRecord(raw, { sourceWebsite: "Superior Hyundai", baseUrl: "https://www.superiorhyundai.ca" });
  assert.equal(listing, null);
});

test("Convertus falls back to initial_price when final_price is missing", () => {
  const raw = convertusToRaw({ year: 2020, make: "Toyota", model: "Corolla", initial_price: 21995, final_price: null, odometer: 50000 });
  assert.equal(raw.price, 21995);
});
