/**
 * Removing listings a refresh didn't see again: the decision (pure), and the
 * storage operation it drives, including the two ways it must NOT delete.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planSweep, SWEEP_FLOOR } from "../services/sweep";
import { MemoryStorage } from "../db/memoryStorage";
import { normalizeRecord } from "../scrapers/normalize";
import { Listing } from "../types";

const decide = (r: Parameters<typeof planSweep>[0][number], held: number) => planSweep([r], { [r.source]: held })[0];

// ---- the decision -------------------------------------------------------------

test("a failed source keeps its listings", () => {
  assert.equal(decide({ source: "A", found: 0, ok: false }, 100).sweep, false);
});

test("a blocked aggregator (ok, zero cars) keeps its listings", () => {
  // CarGurus behind DataDome reports ok:true with nothing: that is "no information".
  assert.equal(decide({ source: "CarGurus.ca", found: 0, ok: true }, 100).sweep, false);
});

test("a run flagged cut short keeps its listings, however many cars it found", () => {
  assert.equal(decide({ source: "A", found: 100, ok: true, complete: false }, 100).sweep, false);
});

test("an aggregator sample under the floor is treated as partial and keeps its listings", () => {
  const held = 100;
  const justUnder = Math.ceil(held * SWEEP_FLOOR) - 1;
  assert.equal(decide({ source: "A", found: justUnder, ok: true }, held).sweep, false);
});

test("an aggregator sample at or over the floor sweeps", () => {
  const held = 100;
  assert.equal(decide({ source: "A", found: Math.ceil(held * SWEEP_FLOOR), ok: true }, held).sweep, true);
  assert.equal(decide({ source: "A", found: 150, ok: true }, held).sweep, true, "growth is fine");
});

test("a source that vouches for a full read sweeps, even below the floor or at zero", () => {
  // A dealer that sold most or all of its lot: the feed was read and is empty.
  assert.equal(decide({ source: "Dealer", found: 2, ok: true, complete: true }, 40).sweep, true);
  assert.equal(decide({ source: "Dealer", found: 0, ok: true, complete: true }, 40).sweep, true);
});

test("a source holding nothing has nothing to sweep", () => {
  assert.equal(decide({ source: "New", found: 30, ok: true, complete: true }, 0).sweep, false);
});

test("every decision explains itself in words", () => {
  const out = planSweep(
    [
      { source: "A", found: 0, ok: false },
      { source: "B", found: 10, ok: true },
    ],
    { A: 5, B: 10 }
  );
  for (const d of out) assert.ok(d.reason.length > 5, `${d.source} has a reason`);
});

// ---- the storage operation -----------------------------------------------------

let storage: MemoryStorage;
before(async () => {
  storage = new MemoryStorage(mkdtempSync(path.join(tmpdir(), "carscore-sweep-")));
  await storage.init();
});

const OLD = "2026-07-20T00:00:00.000Z";

function car(source: string, n: number, extra: Partial<{ vin: string }> = {}): Listing {
  const l = normalizeRecord(
    {
      title: `2020 Toyota Corolla LE ${n}`,
      make: "Toyota",
      model: "Corolla",
      year: 2020,
      price: 20000 + n,
      km: 50000 + n,
      url: `https://${source.toLowerCase()}.example/car/${n}`,
      vin: extra.vin ?? null,
    },
    { sourceWebsite: source, baseUrl: `https://${source.toLowerCase()}.example`, dealer: source }
  );
  assert.ok(l, "fixture normalizes");
  return { ...l, lastSeenAt: OLD, firstSeenAt: OLD };
}

test("removeUnseen deletes only that source's cars that were not seen since the cutoff", async () => {
  await storage.upsertListings([car("Alpha", 1), car("Alpha", 2), car("Beta", 3)]);
  const runStart = new Date().toISOString();

  // This run re-sees Alpha #2 (stamping lastSeenAt = now). Alpha #1 and Beta #3 are not seen.
  await storage.upsertListings([car("Alpha", 2)]);

  const removed = await storage.removeUnseen("Alpha", runStart);
  assert.equal(removed, 1, "only Alpha #1 is unseen");

  const bySource = await storage.countBySource();
  assert.equal(bySource["Alpha"], 1);
  assert.equal(bySource["Beta"], 1, "another source's unseen car is not this sweep's business");
});

test("a car re-seen by a different source survives its owner's sweep", async () => {
  const VIN = "2T1BURHE0JC034461";
  // Held under Gamma, last seen long ago...
  await storage.upsertListings([car("Gamma", 10, { vin: VIN })]);
  const runStart = new Date().toISOString();
  // ...and this run Delta lists the same car. Same VIN, same dedupeKey: a refresh of the one row.
  const delta = car("Delta", 11, { vin: VIN });
  await storage.upsertListings([delta]);

  const removed = await storage.removeUnseen("Gamma", runStart);
  assert.equal(removed, 0, "still listed somewhere, so not gone");
  assert.equal((await storage.countBySource())["Gamma"], 1);
});

test("removeUnseen with nothing stale removes nothing and leaves the file alone", async () => {
  const before = await storage.countListings();
  assert.equal(await storage.removeUnseen("Nobody", new Date().toISOString()), 0);
  assert.equal(await storage.countListings(), before);
});
