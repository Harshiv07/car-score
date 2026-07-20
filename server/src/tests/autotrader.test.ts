/**
 * AutoTrader tile parsing — network-independent. Mirrors the real rendered
 * structure: <article> tiles, an "Open listing details" anchor to /offers/…,
 * text nodes that concatenate without separators ("details2019", photo-count
 * "37" jammed against the year), and a current + struck-through "was" price.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pageUrl, parseAutotraderNextData, parseAutotraderTiles } from "../scrapers/autotrader";
import { normalizeRecord } from "../scrapers/normalize";

const PAGE = `<!doctype html><html><body>
<div class="results-grid">
  <article>
    <a href="https://www.autotrader.ca/offers/toyota-corolla-se-heated-seats-cat_1"><span>Open listing details</span></a>
    <span>Previous</span><span>Next</span><span>37</span><h2>2021 Toyota Corolla Sedan</h2>
    <span class="price">$24,999</span><s class="was">$26,500</s>
    <span>35,000 km</span>
    <img src="https://pics.autotrader.ca/corolla1.jpg">
  </article>
  <article>
    <a href="/offers/toyota-corolla-le-low-km-cat_2"><span>Open listing details</span></a>
    <h2>2019 Toyota Corolla Sedan</h2><span>LE - BC Local</span>
    <span class="price">$19,995</span>
    <span>72,412 km</span>
  </article>
  <article>
    <a href="/offers/toyota-corolla-no-price-cat_3"><span>Open listing details</span></a>
    <h2>Toyota Corolla</h2><span>Call for price</span>
  </article>
</div>
</body></html>`;

test("parses AutoTrader tiles: year, lower-of-two prices, km, url, image", () => {
  const rows = parseAutotraderTiles(PAGE, "Toyota", "Corolla");
  assert.equal(rows.length, 2, "the priceless tile is skipped");
  assert.equal(rows[0].title, "2021 Toyota Corolla");
  assert.equal(rows[0].price, 24999, "asking price = lower of current/was");
  assert.equal(rows[0].km, "35,000 km");
  assert.equal(rows[0].image, "https://pics.autotrader.ca/corolla1.jpg");
  assert.match(String(rows[0].url), /offers\/toyota-corolla-se/);
  assert.equal(rows[1].title, "2019 Toyota Corolla");
});

test("parsed tiles normalize to clean supported listings (no doubled title)", () => {
  const rows = parseAutotraderTiles(PAGE, "Toyota", "Corolla");
  const listing = normalizeRecord(rows[0], {
    sourceWebsite: "AutoTrader.ca",
    baseUrl: "https://www.autotrader.ca",
    province: "ON",
  });
  assert.ok(listing);
  assert.equal(listing!.title, "2021 Toyota Corolla");
  assert.equal(listing!.year, 2021);
  assert.equal(listing!.price, 24999);
  assert.equal(listing!.mileageKm, 35000);
});

/* ---- primary path: __NEXT_DATA__ JSON parsing ---------------------------- */

// Mirrors the real `__NEXT_DATA__` "listings" blob shape captured live from
// AutoTrader (AutoScout24 fields): priceRaw, vehicle.modelYear/mileageInKm/
// modelVersionInput/fuel, location.provinceCode/city, and a real /offers/ url.
const NEXT = `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"numberOfResults":2163,"numberOfPages":109,"listings":[
{"url":"https://www.autotrader.ca/offers/toyota-rav-4-xle-abc","images":["https://prod.pictures.autoscout24.net/listing-images/abc.jpg/250x188.webp"],"price":{"priceRaw":27999},"location":{"countryCode":"CA","provinceCode":"ON","city":"OTTAWA"},"vehicle":{"make":"Toyota","model":"RAV 4","modelVersionInput":"XLE","modelYear":2021,"transmission":"Automatic","fuel":"Gasoline","mileageInKm":"162,742 km"}},
{"url":"https://www.autotrader.ca/offers/toyota-rav-4-le-def","images":["https://x/y.webp"],"price":{"priceRaw":41990},"location":{"provinceCode":"ON","city":"Toronto"},"vehicle":{"make":"Toyota","model":"RAV 4","modelVersionInput":"LE | AWD | REAR CAMERA | HEATED SEATS","modelYear":2024,"transmission":"Automatic","fuel":"Hybrid","mileageInKm":"15,000 km"}},
{"url":"https://www.autotrader.ca/offers/ad-placeholder","price":{},"vehicle":{}}
]}}}
</script></body></html>`;

test("parseAutotraderNextData maps the embedded JSON: year/price/km/trim/fuel/location/url", () => {
  const { rows, numberOfPages } = parseAutotraderNextData(NEXT, "Toyota", "RAV4");
  assert.equal(numberOfPages, 109);
  assert.equal(rows.length, 2, "the price-less ad placeholder is skipped");

  const a = rows[0];
  assert.equal(a.raw.title, "2021 Toyota RAV4", "title from the URL's make/model, not the JSON's 'RAV 4'");
  assert.equal(a.raw.year, 2021);
  assert.equal(a.raw.price, 27999);
  assert.equal(a.raw.km, "162,742 km");
  assert.equal(a.raw.trim, "XLE");
  assert.equal(a.raw.fuel, "Gasoline");
  assert.match(String(a.raw.url), /offers\/toyota-rav-4-xle-abc/);
  assert.match(String(a.raw.image), /autoscout24.*webp/);
  assert.equal(a.province, "ON");
  assert.equal(a.city, "OTTAWA");

  // Dealer marketing junk in modelVersionInput is sanitized to just the trim.
  assert.equal(rows[1].raw.trim, "LE", 'junk "LE | AWD | REAR CAMERA | HEATED SEATS" → "LE"');
  assert.equal(rows[1].raw.fuel, "Hybrid");
});

test("a parsed __NEXT_DATA__ row normalizes into an accurate ON listing (fuel + city preserved)", () => {
  const { rows } = parseAutotraderNextData(NEXT, "Toyota", "RAV4");
  const hybrid = normalizeRecord(rows[1].raw, {
    sourceWebsite: "AutoTrader.ca",
    baseUrl: "https://www.autotrader.ca",
    province: rows[1].province ?? "ON",
    city: rows[1].city,
  });
  assert.ok(hybrid);
  assert.equal(hybrid!.model, "RAV4");
  assert.equal(hybrid!.year, 2024);
  assert.equal(hybrid!.price, 41990);
  assert.equal(hybrid!.fuelType, "Hybrid", "explicit fuel field is used, not smuggled through the title");
  assert.equal(hybrid!.trim, "LE", "clean trim, not the marketing blob");
  assert.equal(hybrid!.city, "Toronto");
  assert.equal(hybrid!.drivetrain, "AWD", "AWD inferred from the trim text");
});

test("returns empty when there is no __NEXT_DATA__ listings blob (fallback territory)", () => {
  const { rows, numberOfPages } = parseAutotraderNextData("<html><body>no data</body></html>", "Toyota", "RAV4");
  assert.equal(rows.length, 0);
  assert.equal(numberOfPages, 1);
});

test("Ontario page URL drops prx=-1 and carries &page=N", () => {
  const u = pageUrl("toyota/rav4", 3);
  assert.ok(!u.includes("prx"), "no national-proximity param → Ontario-only");
  assert.match(u, /\/cars\/toyota\/rav4\/on\//);
  assert.match(u, /[?&]page=3(?:&|$)/);
});
