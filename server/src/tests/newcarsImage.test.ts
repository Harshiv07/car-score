/**
 * Wikimedia Commons image relevance filtering — network-independent. Guards
 * the two real mismatches found while building this: Commons full-text search
 * ranking "Mazda CX-60" above "Mazda CX-50" for a "CX-50" query, and a
 * technically-relevant-but-useless result (fuel gauge closeup, engine bay,
 * hybrid-system diagram) outranking an actual exterior photo.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRelevantTitle } from "../newcars/util";

test("skips an off-model match ranked first (CX-60 for a CX-50 query)", () => {
  const titles = [
    "File:Mazda CX-60 PHEV 1X7A0371.jpg",
    "File:Mazda CX-60 PHEV 1X7A0373.jpg",
    "File:MAZDA CX-50 China.jpg",
  ];
  assert.equal(pickRelevantTitle(titles, "CX-50"), "File:MAZDA CX-50 China.jpg");
});

test("skips technical/detail shots even when they name the right model", () => {
  const titles = [
    "File:Fuel gauge (Toyota Corolla).jpg",
    "File:1972 Toyota Corolla KE20-D engine.jpg",
    "File:2026 Toyota Corolla SE.jpg",
  ];
  assert.equal(pickRelevantTitle(titles, "Corolla"), "File:2026 Toyota Corolla SE.jpg");
});

test("skips logos, diagrams and interior shots", () => {
  const titles = [
    "File:Honda logo.svg",
    "File:Honda Accord dashboard.jpg",
    "File:Honda Accord steering wheel.jpg",
    "File:Honda Accord CV3 e-HEV EX.jpg",
  ];
  assert.equal(pickRelevantTitle(titles, "Accord"), "File:Honda Accord CV3 e-HEV EX.jpg");
});

test("returns null when nothing in the result set is relevant", () => {
  const titles = ["File:Mazda CX-60 front.jpg", "File:Mazda CX-90 rear.jpg"];
  assert.equal(pickRelevantTitle(titles, "CX-50"), null);
});

test("matches regardless of hyphen/space formatting differences", () => {
  const titles = ["File:MAZDACX5 2024 front.jpg"];
  assert.equal(pickRelevantTitle(titles, "CX-5"), titles[0]);
});
