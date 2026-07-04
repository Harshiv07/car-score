/**
 * End-to-end pipeline test (no network): fixture HTML → extract → normalize →
 * upsert into storage. This is the guard the scrape logs point at — if these
 * pass, "0 found" on a live run means the host's network or site markup, not
 * a broken pipeline.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractListings } from "../scrapers/extract";
import { normalizeRecord } from "../scrapers/normalize";
import { MemoryStorage } from "../db/memoryStorage";
import { scoreListing } from "../scoring/engine";
import { Listing } from "../types";

const INVENTORY_PAGE = `<!doctype html><html><head>
<script type="application/ld+json">
[
  {"@type":"Car","name":"2021 Toyota Corolla LE","brand":"Toyota","model":"Corolla","vehicleModelDate":2021,
   "vehicleIdentificationNumber":"5YFEPMAE3MP200001",
   "mileageFromOdometer":{"value":58000},"offers":{"price":20995},"url":"https://dealer.example.com/corolla-le"},
  {"@type":"Car","name":"2020 Subaru Forester Convenience AWD","brand":"Subaru","model":"Forester","vehicleModelDate":2020,
   "mileageFromOdometer":{"value":72000},"offers":{"price":26400},"url":"https://dealer.example.com/forester"},
  {"@type":"Car","name":"2019 Ford F-150 XLT","brand":"Ford","model":"F-150","vehicleModelDate":2019,
   "offers":{"price":31000},"url":"https://dealer.example.com/f150"}
]
</script></head><body></body></html>`;

let storage: MemoryStorage;

before(async () => {
  storage = new MemoryStorage(mkdtempSync(path.join(tmpdir(), "carscore-test-")));
  await storage.init();
});

test("fixture page yields normalized listings for supported models only", () => {
  const raw = extractListings(INVENTORY_PAGE);
  assert.equal(raw.length, 3);
  const normalized = raw
    .map((r) => normalizeRecord(r, { sourceWebsite: "Fixture Dealer", baseUrl: "https://dealer.example.com", dealer: "Fixture Dealer" }))
    .filter((l): l is Listing => l !== null);
  assert.equal(normalized.length, 2, "F-150 must be dropped, Corolla + Forester kept");
});

test("upserting scraped listings adds data, re-scraping the same page adds none", async () => {
  const normalized = extractListings(INVENTORY_PAGE)
    .map((r) => normalizeRecord(r, { sourceWebsite: "Fixture Dealer", baseUrl: "https://dealer.example.com", dealer: "Fixture Dealer" }))
    .filter((l): l is Listing => l !== null);

  const countBefore = await storage.countListings();
  const first = await storage.upsertListings(normalized);
  assert.equal(first.inserted, 2, "first scrape inserts both supported listings");
  assert.equal(await storage.countListings(), countBefore + 2);

  // Same page scraped again → normalize produces new ids but identical dedupe
  // keys, so nothing new is inserted, existing rows are refreshed.
  const again = extractListings(INVENTORY_PAGE)
    .map((r) => normalizeRecord(r, { sourceWebsite: "Fixture Dealer", baseUrl: "https://dealer.example.com", dealer: "Fixture Dealer" }))
    .filter((l): l is Listing => l !== null);
  const second = await storage.upsertListings(again);
  assert.equal(second.inserted, 0, "duplicate scrape must not insert");
  assert.equal(second.updated, 2);
  assert.equal(await storage.countListings(), countBefore + 2);
});

test("every stored supported listing gets a full 100-point score", async () => {
  const all = await storage.getAllListings();
  assert.ok(all.length > 0);
  for (const l of all) {
    const s = scoreListing(l, all);
    assert.ok(s, `expected a score for ${l.title}`);
    assert.ok(s.total >= 0 && s.total <= 100, `score in range for ${l.title}: ${s.total}`);
    assert.equal(s.breakdown.length, 10, "all ten categories present");
    const max = s.breakdown.reduce((sum, c) => sum + c.max, 0);
    assert.equal(max, 100, "category maxima sum to 100");
  }
});
