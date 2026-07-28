import { Listing } from "../types";
import { dedupeKeyFor } from "../util/listingKeys";

export interface RekeyResult {
  /** Rows whose dedupeKey changed under the current scheme. */
  rekeyed: number;
  /** Rows dropped because they turned out to be duplicates of a kept row. */
  merged: number;
  /** The de-duplicated, re-keyed set. */
  listings: Listing[];
  /** Ids of the rows that were dropped, so storage can delete them. */
  removedIds: string[];
}

/**
 * Bring stored rows onto the current identity scheme.
 *
 * Changing how `dedupeKey` is derived would otherwise be silently destructive:
 * every stored row still carries its old key, so the next scrape would match
 * nothing and insert a second copy of the entire inventory. This recomputes the
 * key for each row once, at startup, and collapses any rows that were only ever
 * distinct because the old key was over-specific (the same car stored twice
 * after a price change).
 *
 * When two rows collapse, the older one wins — it carries the true `firstSeenAt`,
 * which the UI shows as "added N days ago" and uses for the NEW badge. Its
 * mutable fields are refreshed from the newer row so nothing current is lost.
 */
/**
 * Stamp incoming listings with a key derived by the *current* rule, and collapse
 * any duplicates inside the batch itself.
 *
 * Storage owns identity — callers don't. A `dedupeKey` that arrives on a
 * listing is only ever a claim, and a stale one is silently destructive: the
 * committed `listingsSnapshot.json` still carries `cmp:` keys from the previous
 * scheme, so re-running `db:seed-snapshot` matched nothing and inserted 1,173
 * duplicates of rows that were already there (only the 16 VIN-keyed ones
 * matched, because `vin:` means the same thing under both schemes).
 *
 * Recomputing here makes every write path — scrapers, snapshot seeding, future
 * importers — safe by construction rather than by remembering to call
 * `finalizeListing`.
 */
export function withCurrentKeys(listings: Listing[]): Listing[] {
  const byKey = new Map<string, Listing>();
  for (const l of listings) {
    const keyed = { ...l, dedupeKey: dedupeKeyFor(l) };
    const seen = byKey.get(keyed.dedupeKey);
    if (!seen) {
      byKey.set(keyed.dedupeKey, keyed);
      continue;
    }
    // Same car twice in one batch (e.g. two search pages overlapping): keep the
    // richer record rather than whichever arrived last.
    seen.mileageKm = seen.mileageKm ?? keyed.mileageKm;
    seen.image = seen.image ?? keyed.image;
    seen.vin = seen.vin ?? keyed.vin;
    seen.listingUrl = seen.listingUrl ?? keyed.listingUrl;
  }
  return [...byKey.values()];
}

export function rekeyListings(listings: Listing[]): RekeyResult {
  const byKey = new Map<string, Listing>();
  const removedIds: string[] = [];
  let rekeyed = 0;
  let merged = 0;

  // Oldest first, so the survivor of a collision is the row that has been
  // around longest rather than whichever happened to be stored last.
  const ordered = [...listings].sort(
    (a, b) => Date.parse(a.firstSeenAt || "") - Date.parse(b.firstSeenAt || "")
  );

  for (const row of ordered) {
    const key = dedupeKeyFor(row);
    if (key !== row.dedupeKey) rekeyed++;

    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, { ...row, dedupeKey: key });
      continue;
    }

    // Duplicate of a row we're keeping: fold the fresher values in and drop it.
    merged++;
    removedIds.push(row.id);
    if (Date.parse(row.lastSeenAt || "") > Date.parse(kept.lastSeenAt || "")) {
      kept.lastSeenAt = row.lastSeenAt;
      kept.price = row.price;
    }
    kept.mileageKm = kept.mileageKm ?? row.mileageKm;
    kept.listingUrl = kept.listingUrl ?? row.listingUrl;
    kept.image = kept.image ?? row.image;
    kept.vin = kept.vin ?? row.vin;
  }

  return { rekeyed, merged, listings: [...byKey.values()], removedIds };
}
