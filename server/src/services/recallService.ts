/**
 * Safety recall lookup, backed by `data/recalls.generated.json` — see
 * `scripts/buildRecallData.ts` for where that file comes from and how to
 * refresh it.
 *
 * This is deliberately NOT wired into `listing.recalls` / `scoreRecalls()`
 * in the scoring engine. That field's scoring treats a nonzero entry as an
 * *open, unresolved* recall and caps the category score for it — accurate
 * for a dealer explicitly stating "this car has an open recall" (the
 * field's original purpose, which no scraped source has ever actually
 * populated), but wrong for what this dataset actually says. A recall here
 * means Transport Canada issued one for that make/model/year at some point;
 * it says nothing about whether *this* VIN still has it outstanding, which
 * only the manufacturer can answer per-VIN. Presenting "12 recalls on
 * record" as if it were "12 open recalls" would misinform the one thing
 * this app can least afford to get wrong for a first-time buyer, so it
 * surfaces as its own clearly-labelled section instead of a score penalty.
 */

import recallData from "../data/recalls.generated.json";

export interface RecallEntry {
  year: number;
  recallNumber: string;
  date: string;
  summary: string;
}

type RawEntry = { y: number; n: string; d: string; s: string };

const DATA = recallData as unknown as Record<string, RawEntry[]>;

function normalizeKey(make: string, model: string): string {
  return `${make}|${model}`.toUpperCase().replace(/[^A-Z0-9|]/g, "");
}

/**
 * Every recall Transport Canada has on record for this exact make/model/year.
 *
 * The source CSV has one row per affected variant/component of a recall, not
 * one row per recall — a single recall number routinely repeats several
 * times for one make/model/year. Deduped here by recall number so "12
 * recalls" in the source data doesn't get shown as 12 distinct entries when
 * it's actually 5.
 */
export function getRecallHistory(make: string, model: string, year: number): RecallEntry[] {
  const entries = DATA[normalizeKey(make, model)];
  if (!entries) return [];
  const seen = new Map<string, RecallEntry>();
  for (const e of entries) {
    if (e.y !== year) continue;
    if (!seen.has(e.n)) seen.set(e.n, { year: e.y, recallNumber: e.n, date: e.d, summary: e.s });
  }
  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}
