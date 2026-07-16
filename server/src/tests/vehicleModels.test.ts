/**
 * matchModelFromTitle is the gate every scraper's raw text passes through
 * before a listing counts as "one of our 10 supported models" — a false
 * positive here silently mislabels one real vehicle as another across every
 * source. Guards a real bug found live: Half-Way Motors Mazda's own site data
 * says `model: "CX-50"`, but a plain `.includes("cx-5")` matched it as our
 * Mazda CX-5 anyway, because "cx-5" is a literal text-prefix of "cx-50".
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchModelFromTitle } from "../data/vehicleModels";

test("a real CX-50 is not matched as our CX-5 (text-prefix collision)", () => {
  const m = matchModelFromTitle("2025 Mazda CX-50 GT All Wheel Drive Gasoline");
  assert.equal(m, null);
});

test("CX-500 (hypothetical) is also not matched as CX-5", () => {
  assert.equal(matchModelFromTitle("2025 Mazda CX-500 Signature"), null);
});

test("a real CX-5 still matches, including the no-dash and spaced alias forms", () => {
  assert.equal(matchModelFromTitle("2025 Mazda CX-5 GT AWD")?.model, "CX-5");
  assert.equal(matchModelFromTitle("2022 Mazda CX5 GS")?.model, "CX-5");
  assert.equal(matchModelFromTitle("2021 Mazda CX 5 Kuro")?.model, "CX-5");
});

test("Corolla Cross (a different Toyota model/platform) is not matched as our Corolla", () => {
  assert.equal(matchModelFromTitle("2023 Toyota Corolla Cross LE AWD"), null);
  assert.equal(matchModelFromTitle("2023 Toyota Corolla  Cross LE"), null, "tolerates double-space from title-casing a slug");
});

test("a real Corolla (incl. Hatchback body style) still matches", () => {
  assert.equal(matchModelFromTitle("2021 Toyota Corolla LE")?.model, "Corolla");
  assert.equal(matchModelFromTitle("2019 Toyota Corolla Hatchback FWD Gasoline")?.model, "Corolla");
});

test("every supported model's own canonical name still matches itself", () => {
  const titles: [string, string][] = [
    ["2021 Toyota RAV4 XLE AWD", "RAV4"],
    ["2020 Honda Civic Sedan LX", "Civic"],
    ["2019 Honda CR-V EX AWD", "CR-V"],
    ["2020 Mazda3 GS AWD", "Mazda3"],
    ["2021 Hyundai Elantra Preferred", "Elantra"],
    ["2022 Hyundai Tucson Essential AWD", "Tucson"],
    ["2020 Subaru Forester Convenience", "Forester"],
    ["2021 Subaru Crosstrek Touring", "Crosstrek"],
  ];
  for (const [title, expected] of titles) {
    assert.equal(matchModelFromTitle(title)?.model, expected, `"${title}" should match ${expected}`);
  }
});

test("an unrelated make/model returns null", () => {
  assert.equal(matchModelFromTitle("2019 Ford F-150 XLT"), null);
  assert.equal(matchModelFromTitle(""), null);
});
