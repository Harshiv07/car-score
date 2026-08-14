import { test } from "node:test";
import assert from "node:assert/strict";
import { getRecallHistory } from "../services/recallService";

test("finds recalls for a real make/model/year known to have one", () => {
  // 2020 Toyota RAV4: porous 2.5L engine block recall, confirmed present in
  // the generated dataset during development.
  const recalls = getRecallHistory("Toyota", "RAV4", 2020);
  assert.ok(recalls.length > 0, "expected at least one recall for 2020 Toyota RAV4");
  for (const r of recalls) {
    assert.equal(r.year, 2020);
    assert.ok(r.recallNumber.length > 0);
    assert.ok(r.date.length > 0);
    assert.ok(r.summary.length > 0);
  }
});

test("is case- and punctuation-insensitive on make/model", () => {
  const a = getRecallHistory("Toyota", "RAV4", 2020);
  const b = getRecallHistory("TOYOTA", "rav4", 2020);
  const c = getRecallHistory(" toyota ", "RAV-4", 2020);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
});

test("returns an empty array for an unknown make/model", () => {
  assert.deepEqual(getRecallHistory("Not A Real Make", "Not A Real Model", 2020), []);
});

test("returns an empty array for a year with no matching recall", () => {
  // Model year far outside any plausible recall record for this make/model.
  assert.deepEqual(getRecallHistory("Toyota", "RAV4", 1904), []);
});

test("sorts results newest-first by date", () => {
  const recalls = getRecallHistory("Toyota", "RAV4", 2020);
  for (let i = 1; i < recalls.length; i++) {
    assert.ok(recalls[i - 1].date >= recalls[i].date, "expected non-increasing date order");
  }
});

test("dedupes multiple source rows for the same recall number", () => {
  // The source CSV has one row per affected variant, so a single recall
  // number appears several times for one make/model/year; each recall
  // should surface once.
  const recalls = getRecallHistory("Toyota", "RAV4", 2020);
  const numbers = recalls.map((r) => r.recallNumber);
  assert.equal(new Set(numbers).size, numbers.length, "expected no duplicate recall numbers");
});
