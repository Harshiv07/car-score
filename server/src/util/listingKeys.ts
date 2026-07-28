import { createHash, randomUUID } from "crypto";
import { Listing } from "../types";

/**
 * Listing identity.
 *
 * Three tiers, strongest first:
 *
 *   1. `vin:`  — the VIN is the car. It's the only key that dedupes the *same
 *                physical vehicle* across sources (a dealer's own site and its
 *                AutoTrader syndication), so it wins when present. Only ~1% of
 *                scraped rows carry one today.
 *   2. `url:`  — the listing's own page. Stable for the life of the listing and
 *                present on 100% of scraped rows, which makes it the key that
 *                actually does the work.
 *   3. `cmp:`  — content hash, for the rare row with neither.
 *
 * Why this replaced `year|make|model|trim|price|dealer`:
 *
 * **Price was part of the identity.** Change the price and the key changes, so
 * a re-scrape after a price drop stored the same car a second time instead of
 * updating it — measured on the real 1,189-listing snapshot, a run where 10% of
 * listings dropped $500 created 118 duplicate rows. `upsertListings` even
 * assigns `existing.price = l.price`, which could never fire, because a changed
 * price never matched an existing key in the first place.
 *
 * **And price was doing the disambiguating.** Only 18 of 1,189 rows carry a
 * dealer, so for almost every row the key reduced to
 * `year|make|model|trim|price`. 670 rows sat in 200 groups distinguished by
 * nothing but price — so two different cars converging on the same asking price
 * would silently collapse into one record.
 *
 * The old key was therefore wrong in both directions at once: it split one car
 * into many, and merged many cars into one. The URL does neither.
 */

/**
 * Canonical form of a listing URL: host + path, lowercased, no query, no
 * fragment, no trailing slash, no `www.`.
 *
 * Dropping the query is safe for every source we scrape — verified against the
 * snapshot, where host+path is already unique per listing on all four sites.
 * Each puts its identifier in the path (AutoTrader a UUID, Convertus dealers a
 * stock number, the WordPress dealer a slug); the only query strings present
 * are display noise like `?sale_class=Used`, which would otherwise make the key
 * depend on which link we happened to follow.
 *
 * Percent-escapes are decoded so `RAV%204` and `RAV 4` can't key differently.
 */
export function normalizeListingUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.host.toLowerCase().replace(/^www\./, "");

  let path = parsed.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* malformed escape — keep the raw path rather than dropping the listing */
  }
  path = path.replace(/\/+$/, "").toLowerCase();

  return host + path;
}

/** A VIN is 17 chars, but scrapers sometimes surface a truncated one; accept
 *  anything long enough to be unambiguous and reject obvious placeholders. */
function usableVin(vin: string | null | undefined): string | null {
  if (!vin) return null;
  const v = vin.trim().toUpperCase();
  if (v.length < 11) return null;
  if (/^0+$|^N\/?A$|^UNKNOWN$/.test(v)) return null;
  return v;
}

export interface DedupeInput {
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  dealer: string | null;
  listingUrl?: string | null;
  mileageKm?: number | null;
  city?: string | null;
  sourceWebsite?: string | null;
}

export function dedupeKeyFor(l: DedupeInput): string {
  const vin = usableVin(l.vin);
  if (vin) return `vin:${vin}`;

  const url = normalizeListingUrl(l.listingUrl);
  if (url) return `url:${url}`;

  // Last resort. Deliberately excludes price — see the note above — and leans
  // on mileage instead, which identifies a specific used car and doesn't drift
  // between scrapes the way an asking price does.
  const raw = [
    l.year,
    l.make,
    l.model,
    l.trim ?? "",
    l.mileageKm ?? "",
    l.dealer ?? "",
    l.city ?? "",
    l.sourceWebsite ?? "",
  ]
    .join("|")
    .toLowerCase();
  return `cmp:${createHash("sha1").update(raw).digest("hex").slice(0, 16)}`;
}

/** Key prefixes this app understands. Used to spot rows written by an older
 *  scheme so they can be re-keyed instead of duplicated. */
export const DEDUPE_PREFIXES = ["vin:", "url:", "cmp:"] as const;

/**
 * The previous scheme: VIN, else a hash of year|make|model|trim|price|dealer.
 *
 * Kept only so the one-time seed cleanup can identify rows the *old* code wrote.
 * Do not use it for new writes — it is the scheme this file exists to replace.
 * It lives here, frozen, rather than being re-derived from the current function,
 * because a delete-by-key whose keys move when the scheme moves is a way to
 * delete live data by accident.
 */
export function legacyDedupeKeyFor(l: {
  vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  price: number;
  dealer: string | null;
}): string {
  if (l.vin && l.vin.trim().length >= 11) {
    return `vin:${l.vin.trim().toUpperCase()}`;
  }
  const raw = [l.year, l.make, l.model, l.trim ?? "", l.price, l.dealer ?? ""].join("|").toLowerCase();
  return `cmp:${createHash("sha1").update(raw).digest("hex").slice(0, 16)}`;
}

export function newListingId(): string {
  return `lst_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Fill id/dedupeKey/timestamps on a listing that lacks them. */
export function finalizeListing(partial: Omit<Listing, "id" | "dedupeKey" | "firstSeenAt" | "lastSeenAt">): Listing {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: newListingId(),
    dedupeKey: dedupeKeyFor(partial),
    firstSeenAt: now,
    lastSeenAt: now,
  };
}
