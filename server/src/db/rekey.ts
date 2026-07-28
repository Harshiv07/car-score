import { Listing } from "../types";
import { dedupeKeyFor, normalizeListingUrl } from "../util/listingKeys";

/** What makes two rows the same physical vehicle, ignoring anything that
 *  drifts between scrapes (price, timestamps, photos). */
function vehicleShape(l: Listing): string {
  return [l.year, l.make, l.model, l.trim ?? "", l.mileageKm ?? ""].join("|").toLowerCase();
}

/**
 * URLs that are pages rather than listings.
 *
 * A URL shared by several rows is ambiguous, and the two readings need opposite
 * treatment:
 *
 *   - **The same car stored twice** — a duplicate left behind by the old
 *     price-in-key scheme. Those rows describe one vehicle, and the URL is
 *     exactly the right thing to merge them on.
 *   - **Different cars sharing a page** — a dealer's inventory index, a model's
 *     search results, Clutch's `/cars` fallback for id-less vehicles, or a seed
 *     row pointing at `cargurus.ca`. Keying on that fuses an entire lot into
 *     one record.
 *
 * They are distinguishable: duplicates of one car agree on year, make, model,
 * trim and odometer; cars sharing a page do not. So a URL is disqualified only
 * when the rows holding it describe *different vehicles*.
 *
 * This is a systemic guard rather than a fix for one scraper. Clutch handing
 * every id-less vehicle the same `/cars` URL is patched at the source, but any
 * future source could reintroduce the pattern, and identity should refuse to
 * collapse distinct cars no matter what it is handed.
 */
function pageUrls(listings: Listing[]): Set<string> {
  const shapes = new Map<string, Set<string>>();
  for (const l of listings) {
    const u = normalizeListingUrl(l.listingUrl);
    if (!u) continue;
    const set = shapes.get(u) ?? new Set<string>();
    set.add(vehicleShape(l));
    shapes.set(u, set);
  }
  return new Set([...shapes].filter(([, s]) => s.size > 1).map(([u]) => u));
}

export interface RekeyResult {
  /** Rows whose dedupeKey changed under the current scheme. */
  rekeyed: number;
  /** Rows left on their old key because another row already claimed the new
   *  one. Reported so a spike is visible rather than silent. */
  collisions: number;
  /** Every input row, in full — this migration never drops anything. */
  listings: Listing[];
}

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
  const pages = pageUrls(listings);
  const byKey = new Map<string, Listing>();
  for (const l of listings) {
    // A URL handed to several cars in one batch is a page, not a listing.
    const usable = !pages.has(normalizeListingUrl(l.listingUrl) ?? "");
    const keyed = { ...l, dedupeKey: dedupeKeyFor(usable ? l : { ...l, listingUrl: null }) };
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

/**
 * Bring stored rows onto the current identity scheme, at startup, without ever
 * removing one.
 *
 * Changing how `dedupeKey` is derived is otherwise silently destructive in both
 * directions: stored rows still carry their old key, so the next scrape matches
 * nothing and inserts a second copy of the whole inventory — while a migration
 * that "tidies" the rows it thinks are duplicates can delete real inventory if
 * its notion of identity is wrong.
 *
 * The first version did exactly that. It deleted the losers of a key collision
 * and then issued an ordered bulkWrite of the new keys against a uniquely
 * indexed `dedupeKey`; reassigning a key still held by an unprocessed row threw,
 * the throw escaped `init()`, the process exited, and the host restarted into
 * the same migration — deleting a little more on each pass. So this one cannot
 * delete at all. A row whose new key is already taken simply keeps its old key,
 * and the next upsert (which derives keys the same way) reconciles it.
 */
export function rekeyListings(listings: Listing[]): RekeyResult {
  const pages = pageUrls(listings);
  const taken = new Map<string, Listing>();
  const out: Listing[] = [];
  let rekeyed = 0;
  let collisions = 0;

  // Oldest first, so when two rows want the same key the one that has been
  // around longest keeps it — it holds the true firstSeenAt.
  const ordered = [...listings].sort(
    (a, b) => Date.parse(a.firstSeenAt || "") - Date.parse(b.firstSeenAt || "")
  );

  for (const row of ordered) {
    const usable = !pages.has(normalizeListingUrl(row.listingUrl) ?? "");
    const key = dedupeKeyFor(usable ? row : { ...row, listingUrl: null });

    if (!taken.has(key)) {
      if (key !== row.dedupeKey) rekeyed++;
      const next = { ...row, dedupeKey: key };
      taken.set(key, next);
      out.push(next);
      continue;
    }

    // Another row already owns this key. Leave this one exactly as it is: a
    // startup migration must never destroy data it merely failed to classify.
    // A genuine duplicate will be reconciled by the next upsert, which derives
    // keys the same way — and a *wrongly* collapsed row would be unrecoverable.
    collisions++;
    out.push(row);
  }

  return { rekeyed, collisions, listings: out };
}
