/**
 * AutoTrader tile parsing — network-independent. Mirrors the real rendered
 * structure: <article> tiles, an "Open listing details" anchor to /offers/…,
 * text nodes that concatenate without separators ("details2019", photo-count
 * "37" jammed against the year), and a current + struck-through "was" price.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAutotraderTiles } from "../scrapers/autotrader";
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
