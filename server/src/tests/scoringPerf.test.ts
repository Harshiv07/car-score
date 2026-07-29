import test from "node:test";
import assert from "node:assert/strict";
import { scoreListing } from "../scoring/engine";
import { Listing } from "../types";
import snapshot from "../data/listingsSnapshot.json";

const ALL = (snapshot as unknown as { listings: Listing[] }).listings;

function bucketByModel(listings: Listing[]): Map<string, Listing[]> {
  const buckets = new Map<string, Listing[]>();
  for (const l of listings) {
    const key = `${l.make}|${l.model}`.toLowerCase();
    const b = buckets.get(key);
    if (b) b.push(l);
    else buckets.set(key, [l]);
  }
  return buckets;
}

/**
 * The optimisation these guard is a claim about *equivalence*: scoring against
 * only same-model listings must produce byte-identical results to scoring
 * against the whole inventory, because Market Value's comparable filter already
 * requires the same make and model. A faster engine that quietly scores
 * differently would be far worse than a slow one.
 */
test("bucketed comparables score identically to the full inventory", () => {
  const buckets = bucketByModel(ALL);
  let compared = 0;

  for (const l of ALL) {
    const full = scoreListing(l, ALL);
    const bucketed = scoreListing(l, buckets.get(`${l.make}|${l.model}`.toLowerCase()) ?? [l]);
    assert.deepEqual(bucketed, full, `score mismatch for ${l.id} (${l.title})`);
    compared++;
  }

  assert.ok(compared > 1000, `expected the whole snapshot, compared ${compared}`);
});

test("market comparison keeps its sample size and method under bucketing", () => {
  // The two ways this could silently degrade: a smaller comparable pool would
  // drop `sampleSize` below the 3 needed for the "comparables" method and fall
  // back to the model baseline, changing every affected price.
  const buckets = bucketByModel(ALL);
  const withComparables = ALL.filter((l) => {
    const s = scoreListing(l, ALL);
    return s?.market.method === "comparables";
  });
  assert.ok(withComparables.length > 0, "snapshot should contain comparable-priced cars");

  for (const l of withComparables) {
    const bucketed = scoreListing(l, buckets.get(`${l.make}|${l.model}`.toLowerCase()) ?? [l]);
    assert.equal(bucketed?.market.method, "comparables", l.id);
  }
});
