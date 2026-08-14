/**
 * `npm run recalls:build -w server`
 *
 * Regenerates `server/src/data/recalls.generated.json` from Transport
 * Canada's Vehicle Recalls Database (VRDB) monthly CSV export.
 *
 * The "official" query API at data.tc.gc.ca only ever returns its own field
 * schema, not data rows, no matter which parameter names are tried (both
 * `make=` and the documented `make-name=` acronym form) — and the newer
 * tc.api.canada.ca VRDB endpoint requires a registered API key. The one
 * source that's genuinely open (no key, real rows) is the bulk CSV Transport
 * Canada publishes alongside those APIs: https://opendatatc.tc.canada.ca/vrdb_full_monthly.csv
 * — found via open.canada.ca's CKAN `package_show` API, which lists every
 * resource URL for the dataset, not just the ones the dataset page links.
 *
 * That CSV is the full recall history since 1975 (~145K rows, ~200MB,
 * bilingual). This script downloads it, keeps only what a used-car buyer
 * actually cares about — Car/SUV/Light Truck & Van/Minivan, model year 2005+
 * — and collapses it to {year, recall number, date, short summary} grouped
 * by a normalized MAKE|MODEL key. That took it from ~200MB / 146K rows to
 * ~9MB / 42K rows, small enough to commit and load into memory at startup
 * like `vehicleModels.ts`.
 *
 * This is a bulk snapshot, not a live feed, by design — same reasoning as
 * `snapshotListings.ts`: a fixed, versioned file the app can load with zero
 * network dependency, refreshed by deliberately re-running this script
 * rather than an API call on every request. Transport Canada updates the
 * source CSV roughly monthly; re-run this every few months.
 *
 * IMPORTANT — what this data does and doesn't mean: a row here means a
 * recall was *issued* for that make/model/year at some point. It does not
 * mean the specific VIN in a listing still has it outstanding — completion
 * status is only checkable per-VIN through the manufacturer, which this
 * open dataset doesn't carry. Never treat a nonzero count here as "this car
 * currently has an open recall" — see the ownership-page copy and
 * `recallService.ts` for how this is framed to the user.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";

const CSV_URL = "https://opendatatc.tc.canada.ca/vrdb_full_monthly.csv";
const OUT_PATH = path.join(__dirname, "..", "data", "recalls.generated.json");

const KEEP_CATEGORIES = new Set(["Car", "SUV", "Light Truck & Van", "Minivan"]);
const MIN_YEAR = 2005;
const MAX_SUMMARY_LEN = 180;

interface RecallEntry {
  y: number; // model year
  n: string; // recall number
  d: string; // recall date, YYYY-MM-DD
  s: string; // short summary (English)
}

function normalizeKey(make: string, model: string): string {
  return `${make}|${model}`.toUpperCase().replace(/[^A-Z0-9|]/g, "");
}

/**
 * Full-text, quote-aware CSV tokenizer.
 *
 * A line-split-then-parse-each-line approach (the first version of this
 * function) silently corrupts any record whose comment field contains a
 * literal embedded newline — RFC 4180 allows that inside a quoted field, and
 * this dataset's recall descriptions actually do it. The symptom was
 * specific and quiet: some rows parsed fine, others had a missing date and a
 * comment truncated to "Issue:" — a shifted-columns bug, not a crash, so it
 * would have shipped wrong data undetected without the recallService test
 * that checks every field of a known real recall is populated. Parsing the
 * whole text in one pass and only treating a newline as a row break when
 * outside quotes is what actually respects the format.
 *
 * Builds each field with `text.slice()` over unbroken runs rather than
 * `cur += text[i]` per character. The first version of this rewrite did the
 * latter — one string concatenation per character, ~190 million of them for
 * this file — and crashed Node with an out-of-memory FATAL ERROR rather than
 * a JS exception, from the sheer number of intermediate string allocations.
 * Slicing at field boundaries instead does the same number of *fields'*
 * worth of allocations, not characters': ~5 orders of magnitude fewer.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let fieldParts: string[] = [];
  let segStart = 0;
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const flush = () => {
    if (i > segStart) fieldParts.push(text.slice(segStart, i));
  };
  const endField = () => {
    flush();
    row.push(fieldParts.join(""));
    fieldParts = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        flush();
        fieldParts.push('"');
        i += 2;
        segStart = i;
        continue;
      }
      if (c === '"') {
        flush();
        inQuotes = false;
        i++;
        segStart = i;
        continue;
      }
      i++;
      continue;
    }
    if (c === '"') {
      flush();
      inQuotes = true;
      i++;
      segStart = i;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      segStart = i;
      continue;
    }
    if (c === "\r") {
      flush();
      i++;
      segStart = i;
      continue;
    }
    if (c === "\n") {
      endField();
      rows.push(row);
      row = [];
      i++;
      segStart = i;
      continue;
    }
    i++;
  }
  flush();
  if (fieldParts.length > 0 || row.length > 0) {
    row.push(fieldParts.join(""));
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log(`Downloading ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`Downloaded ${(text.length / 1024 / 1024).toFixed(1)} MB.`);

  console.log("Parsing CSV...");
  const rows = parseCsvRows(text);
  console.log(`Parsed ${rows.length} rows (including header).`);
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const idx = {
    year: col("YEAR"),
    number: col("RECALL_NUMBER_NUM"),
    category: col("CATEGORY_ETXT"),
    make: col("MAKE_NAME_NM"),
    model: col("MODEL_NAME_NM"),
    comment: col("COMMENT_ETXT"),
    date: col("RECALL_DATE_DTE"),
  };
  for (const [k, v] of Object.entries(idx)) {
    if (v === -1) throw new Error(`CSV column missing: ${k}`);
  }

  const out: Record<string, RecallEntry[]> = {};
  let kept = 0;
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (cols.length <= 1) continue; // blank trailing row
    const category = cols[idx.category];
    if (!KEEP_CATEGORIES.has(category)) continue;
    const year = parseInt(cols[idx.year], 10);
    if (!Number.isFinite(year) || year < MIN_YEAR) continue;
    const make = cols[idx.make]?.trim();
    const model = cols[idx.model]?.trim();
    if (!make || !model) continue;

    let summary = (cols[idx.comment] || "").trim().replace(/\s+/g, " ");
    if (summary.length > MAX_SUMMARY_LEN) summary = summary.slice(0, MAX_SUMMARY_LEN - 3) + "...";

    const key = normalizeKey(make, model);
    const entry: RecallEntry = { y: year, n: cols[idx.number], d: cols[idx.date], s: summary };
    (out[key] ??= []).push(entry);
    kept++;
  }

  writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`Kept ${kept} rows across ${Object.keys(out).length} make|model keys -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
