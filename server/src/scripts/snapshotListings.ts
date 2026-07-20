/**
 * `npm run scrape:snapshot -w server`
 *
 * Runs every active scraper once and writes the resulting listings to
 * `server/src/data/listingsSnapshot.json` — a point-in-time capture of real
 * scraped data, committed to the repo so it can be used *later* as initial
 * data (see `seedFromSnapshot.ts`) without needing a live scrape first, e.g.
 * right after a fresh deploy or in an environment where every source happens
 * to be blocked at that moment.
 *
 * Deliberately a separate, explicit step from loading it — this app stopped
 * auto-seeding fabricated demo data on an empty DB on purpose (the
 * leaderboard should show real, current scraped inventory by default); a
 * snapshot is real data, but it's a frozen-in-time real, and only actually
 * fresh again when someone deliberately chooses to load it.
 *
 * Respects SCRAPE_SOURCES/SCRAPE_MAX_PAGES/etc. the same as a normal scrape
 * run (see scrapers/config.ts) — e.g. `SCRAPE_SOURCES=clutch,autotrader npm
 * run scrape:snapshot -w server` to snapshot just the reliable sources.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { Listing } from "../types";
import { activeScrapers } from "../scrapers";
import { LogFn } from "../scrapers/types";

const OUT_PATH = path.join(__dirname, "..", "data", "listingsSnapshot.json");

const DIM = "\x1b[2m",
  RESET = "\x1b[0m",
  GREEN = "\x1b[32m",
  YELLOW = "\x1b[33m";

async function main() {
  const log: LogFn = (level, message) => {
    const color = level === "error" ? "\x1b[31m" : level === "warn" ? YELLOW : DIM;
    console.log(`  ${color}[${level}]${RESET} ${message}`);
  };

  const listings: Listing[] = [];
  const seen = new Set<string>();
  const bySource: Record<string, number> = {};

  console.log(`Snapshotting ${activeScrapers().length} source(s)…\n`);
  for (const scraper of activeScrapers()) {
    console.log(`${scraper.source}:`);
    const t0 = Date.now();
    try {
      const result = await scraper.run(log);
      let added = 0;
      for (const listing of result.listings) {
        if (seen.has(listing.dedupeKey)) continue;
        seen.add(listing.dedupeKey);
        listings.push(listing);
        added++;
      }
      bySource[scraper.source] = added;
      console.log(`  -> ${GREEN}${added}${RESET} new listing(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    } catch (e) {
      console.log(`  -> threw: ${(e as Error).message.slice(0, 150)}\n`);
    }
  }

  const snapshot = {
    capturedAt: new Date().toISOString(),
    totalListings: listings.length,
    bySource,
    listings,
  };
  writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2));

  console.log(`Wrote ${listings.length} listing(s) across ${Object.keys(bySource).length} source(s) to:`);
  console.log(`  ${OUT_PATH}`);
  console.log(`\n${DIM}Run \`npm run db:seed-snapshot -w server\` to load this into your configured storage.${RESET}`);
  process.exit(0);
}

main();
