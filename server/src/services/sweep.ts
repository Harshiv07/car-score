/**
 * Which sources may remove the listings a refresh did not see again.
 *
 * Nothing used to leave the inventory: a car that sold stayed on the
 * leaderboard until someone cleared the database. A blunt wipe-then-scrape
 * fixes that on a good day and empties the site on a bad one (a blocked source
 * returns zero cars and `ok: true`), so removal is decided per source, after
 * the whole run, and only for sources whose result can be believed.
 *
 * A result is believed when:
 *   - the scraper vouches for it (`complete: true`: it read the whole inventory,
 *     so a car it no longer lists is gone, even if that leaves zero), or
 *   - it is an ordinary successful run with cars in it, was not flagged
 *     `complete: false`, and found at least `SWEEP_FLOOR` of the rows we already
 *     hold for that source. The floor is what stops a crawl that was cut short
 *     (a deadline, a half-blocked site) from deleting the other half.
 *
 * It is pure: it reads results and counts, and decides. Deleting is the caller's.
 */

export interface SweepResult {
  source: string;
  found: number;
  ok: boolean;
  complete?: boolean;
}

export interface SweepDecision {
  source: string;
  sweep: boolean;
  /** Why, in words fit for the activity log. */
  reason: string;
}

/** A sample-based source must still see this share of what it held before. */
export const SWEEP_FLOOR = 0.5;

export function planSweep(results: SweepResult[], existingBySource: Record<string, number>): SweepDecision[] {
  return results.map((r) => {
    const held = existingBySource[r.source] ?? 0;
    const keep = (reason: string): SweepDecision => ({ source: r.source, sweep: false, reason });

    if (!r.ok) return keep("source failed, kept its listings");
    if (r.complete === false) return keep("crawl was cut short, kept its listings");
    if (held === 0) return keep("nothing held for this source");

    if (r.complete === true) return { source: r.source, sweep: true, reason: "read the full inventory" };

    if (r.found === 0) return keep("returned no cars, kept its listings");
    if (r.found < held * SWEEP_FLOOR) {
      return keep(`found ${r.found} of ${held} held (under ${Math.round(SWEEP_FLOOR * 100)}%), kept its listings`);
    }
    return { source: r.source, sweep: true, reason: `found ${r.found} of ${held} held` };
  });
}
