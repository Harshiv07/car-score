import test from "node:test";
import assert from "node:assert/strict";
import { intParam } from "../util/http";
import { findScoredById } from "../services/listingService";
import { ScoredListing } from "../types";

test("intParam accepts whole numbers and clamps them into range", () => {
  assert.equal(intParam("3", 1, 1, 100), 3);
  assert.equal(intParam("0", 1, 1, 100), 1);
  assert.equal(intParam("-5", 1, 1, 100), 1);
  assert.equal(intParam("5000", 50, 1, 100), 100);
});

test("intParam falls back on anything that is not a whole number", () => {
  // These all parse via Number() and used to reach slice() / the page maths.
  for (const bad of ["1.5", "abc", "", " ", "NaN", "Infinity", undefined, null, ["2"], {}]) {
    assert.equal(intParam(bad, 7, 1, 100), 7, `input ${JSON.stringify(bad)}`);
  }
});

test("findScoredById finds by id and misses cleanly", () => {
  const rows = [{ id: "a" }, { id: "b" }] as ScoredListing[];
  assert.equal(findScoredById(rows, "b"), rows[1]);
  assert.equal(findScoredById(rows, "zzz"), undefined);
});

test("findScoredById indexes per snapshot, so a rescored array is never stale", () => {
  const first = [{ id: "a" }] as ScoredListing[];
  assert.ok(findScoredById(first, "a"));
  const second = [{ id: "c" }] as ScoredListing[];
  assert.equal(findScoredById(second, "a"), undefined);
  assert.ok(findScoredById(second, "c"));
});
