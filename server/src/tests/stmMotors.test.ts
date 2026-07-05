/**
 * STM Motors (Gore Motors) VDP parsing — network-independent. Year/make/model
 * come from the URL slug; price (space-separated) and mileage from the page.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStmVehicle } from "../scrapers/stmMotors";
import { normalizeRecord } from "../scrapers/normalize";

const VDP_HTML = `<!doctype html><html><head>
<meta property="og:image" content="https://goremotorshonda.com/img/civic.jpg">
</head><body>
  <div class="single-price"><span class="price">$23 999</span></div>
  <div class="finance"><span class="price">$149</span> bi-weekly</div>
  <ul class="stm-listing-single-meta">
    <li><span>Mileage</span><span>44376km</span></li>
  </ul>
</body></html>`;

test("parses year/make/model from slug and price/km from the page", () => {
  const raw = parseStmVehicle("https://goremotorshonda.com/listings/2019-honda-civic-touring/", VDP_HTML);
  assert.ok(raw);
  assert.equal(raw!.title, "2019 Honda Civic Touring");
  assert.equal(raw!.price, 23999, "picks the vehicle price, not the $149 payment");
  assert.equal(raw!.km, 44376);
  assert.equal(raw!.url, "https://goremotorshonda.com/listings/2019-honda-civic-touring/");
});

test("a parsed STM vehicle normalizes to a supported listing", () => {
  const raw = parseStmVehicle("https://goremotorshonda.com/listings/2021-honda-cr-v-sport/", VDP_HTML.replace("44376km", "77106km"));
  const listing = normalizeRecord(raw!, {
    sourceWebsite: "Gore Motors Honda",
    baseUrl: "https://goremotorshonda.com",
    dealer: "Gore Motors Honda",
    city: "Thunder Bay",
    province: "ON",
  });
  assert.ok(listing);
  assert.equal(listing!.make, "Honda");
  assert.equal(listing!.model, "CR-V");
  assert.equal(listing!.year, 2021);
  assert.equal(listing!.mileageKm, 77106);
  assert.equal(listing!.isDealer, true);
});

test("returns null for a non-vehicle slug (no year)", () => {
  assert.equal(parseStmVehicle("https://goremotorshonda.com/listings/", VDP_HTML), null);
});
