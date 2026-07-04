/**
 * `npm run scrape:check -w server`
 *
 * 1. Verifies the extract → normalize → map → score pipeline on fixtures
 *    (network-independent). Exits non-zero if the pipeline itself is broken.
 * 2. Optionally does a short LIVE probe of each active source so you can see,
 *    per source, how many listings come back from THIS network right now.
 *    Pass `--live` to enable it (off by default so CI stays deterministic).
 */

import { verifyPipeline } from "../services/selfCheck";
import { activeScrapers } from "../scrapers";
import { LogFn } from "../scrapers/types";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", RESET = "\x1b[0m";
const mark = (ok: boolean) => (ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`);

async function main() {
  const live = process.argv.includes("--live");

  console.log("\nPipeline self-check (no network):");
  const report = verifyPipeline();
  for (const s of report.steps) console.log(`  ${mark(s.ok)} ${s.name.padEnd(12)} ${DIM}${s.detail}${RESET}`);
  console.log(report.ok ? `\n${GREEN}Pipeline healthy.${RESET}` : `\n${RED}Pipeline BROKEN — fix before shipping.${RESET}`);

  if (live) {
    console.log("\nLive source probe (this network):");
    const noop: LogFn = () => {};
    for (const scraper of activeScrapers()) {
      const t0 = Date.now();
      try {
        const r = await scraper.run(noop);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  ${mark(r.listings.length > 0)} ${scraper.source.padEnd(22)} ${r.listings.length} listing(s) ${DIM}${secs}s — ${r.note}${RESET}`);
      } catch (e) {
        console.log(`  ${mark(false)} ${scraper.source.padEnd(22)} threw: ${(e as Error).message.slice(0, 80)}`);
      }
    }
  } else {
    console.log(`\n${DIM}(run with --live to probe each source over the network)${RESET}`);
  }

  process.exit(report.ok ? 0 : 1);
}

main();
