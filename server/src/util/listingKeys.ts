import { createHash, randomUUID } from "crypto";
import { Listing } from "../types";

/**
 * Duplicate rules (per spec): VIN when present, otherwise
 * year + make + model + trim + price + dealer.
 */
export function dedupeKeyFor(l: {
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
  const raw = [l.year, l.make, l.model, l.trim ?? "", l.price, l.dealer ?? ""]
    .join("|")
    .toLowerCase();
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
