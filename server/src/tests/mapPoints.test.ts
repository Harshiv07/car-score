import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPoints } from "../services/mapPoints";
import type { ScoredListing } from "../types";

function car(id: string, price: number, km: number | null, score: number, market = 20000): ScoredListing {
  return {
    id,
    year: 2020,
    make: "Toyota",
    model: "RAV4",
    price,
    mileageKm: km,
    score: { total: score, market: { marketPrice: market } },
  } as unknown as ScoredListing;
}

test("mapPoints drops cars that can't be placed", () => {
  const pts = mapPoints([car("a", 20000, 50000, 80), car("b", 20000, null, 90), car("c", 0, 10, 90)]);
  assert.deepEqual(pts.map((p) => p.id), ["a"]);
});

test("mapPoints projects a compact point with the gap to market", () => {
  const [p] = mapPoints([car("a", 18500, 62000, 79.6, 20000)]);
  assert.deepEqual(p, { id: "a", p: 18500, k: 62000, s: 80, t: "2020 Toyota RAV4", d: -1500 });
});

test("mapPoints keeps the best-scored when over the limit", () => {
  const cars = [car("lo", 1, 1, 10), car("hi", 1, 1, 90), car("mid", 1, 1, 50)];
  assert.deepEqual(mapPoints(cars, 2).map((p) => p.id).sort(), ["hi", "mid"]);
});
