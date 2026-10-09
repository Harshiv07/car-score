/**
 * Storage facade. Two drivers:
 *  - MongoStorage (Mongoose) when MONGODB_URI is set — the production path.
 *  - MemoryStorage (JSON file under server/.data) otherwise, so the app is
 *    fully runnable in dev environments without a MongoDB instance.
 *
 * Query filtering/sorting happens in the service layer over the full listing
 * set: the scoring engine needs every listing anyway to compute market
 * comparables, and the dataset is small (hundreds of rows).
 */

import { Listing, ScrapeHistoryEntry } from "../types";

export interface UpsertResult {
  inserted: number;
  updated: number;
}

export interface Storage {
  readonly kind: "mongo" | "memory";
  init(): Promise<void>;

  getAllListings(): Promise<Listing[]>;
  getListingById(id: string): Promise<Listing | null>;
  /** Insert new listings / refresh lastSeenAt+price of known ones, by dedupeKey. */
  upsertListings(listings: Listing[]): Promise<UpsertResult>;
  countListings(): Promise<number>;
  /** How many listings are held per `sourceWebsite`. */
  countBySource(): Promise<Record<string, number>>;
  /**
   * Delete `source`'s listings whose `lastSeenAt` is before `before` (ISO) and
   * return how many went. Every upsert, from any source, stamps `lastSeenAt`, so
   * a car still listed elsewhere is not "unseen". Callers decide whether the
   * source's run can be believed (see services/sweep.ts).
   */
  removeUnseen(source: string, before: string): Promise<number>;

  addScrapeHistory(entry: ScrapeHistoryEntry): Promise<void>;
  updateScrapeHistory(entry: ScrapeHistoryEntry): Promise<void>;
  getScrapeHistory(limit: number): Promise<ScrapeHistoryEntry[]>;
  getLastCompletedScrape(): Promise<ScrapeHistoryEntry | null>;
}

let instance: Storage | null = null;

export async function getStorage(): Promise<Storage> {
  if (instance) return instance;
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { MongoStorage } = await import("./mongoStorage");
    instance = new MongoStorage(uri);
  } else {
    const { MemoryStorage } = await import("./memoryStorage");
    instance = new MemoryStorage();
  }
  await instance.init();
  return instance;
}
