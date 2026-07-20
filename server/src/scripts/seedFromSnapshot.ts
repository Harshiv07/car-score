/**
 * `npm run db:seed-snapshot -w server`
 *
 * Loads `server/src/data/listingsSnapshot.json` (see snapshotListings.ts)
 * into whatever storage is currently configured (MongoDB if MONGODB_URI is
 * set, else the local memory/file store) via the normal upsert path — so
 * re-running this is safe and just refreshes existing rows rather than
 * duplicating them.
 *
 * Explicit and manual on purpose, not automatic on an empty DB: this app
 * deliberately stopped auto-seeding on startup so the leaderboard always
 * reflects real, current scraped inventory rather than a fixed snapshot that
 * silently goes stale. Run this yourself when you actually want it — e.g.
 * once, right after a fresh deploy, before the first real scrape has had a
 * chance to run.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Listing } from "../types";
import { getStorage } from "../db/storage";

const SNAPSHOT_PATH = path.join(__dirname, "..", "data", "listingsSnapshot.json");

interface SnapshotFile {
  capturedAt: string;
  totalListings: number;
  bySource: Record<string, number>;
  listings: Listing[];
}

async function main() {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`No snapshot found at ${SNAPSHOT_PATH}.`);
    console.error("Run `npm run scrape:snapshot -w server` first to create one.");
    process.exit(1);
  }

  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as SnapshotFile;
  const ageMs = Date.now() - new Date(snapshot.capturedAt).getTime();
  const ageHours = (ageMs / 3_600_000).toFixed(1);
  console.log(`Loading snapshot captured ${snapshot.capturedAt} (${ageHours}h ago): ${snapshot.listings.length} listing(s).`);

  const storage = await getStorage();
  console.log(`Storage: ${storage.kind}`);
  const { inserted, updated } = await storage.upsertListings(snapshot.listings);
  console.log(`\nDone: ${inserted} inserted, ${updated} refreshed.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", (e as Error).message);
  process.exit(1);
});
