import { promises as fs } from "fs";
import path from "path";
import { Listing, ScrapeHistoryEntry } from "../types";
import { Storage, UpsertResult } from "./storage";
import { SEED_DEDUPE_KEYS } from "./seed";
import { rekeyListings, withCurrentKeys } from "./rekey";

interface Snapshot {
  listings: Listing[];
  scrapeHistory: ScrapeHistoryEntry[];
}

/**
 * JSON-file-backed storage used when no MONGODB_URI is configured.
 * Persists across restarts; seeds itself on first run.
 *
 * The data directory is resolved at construction time (not module load) so
 * tests can point CARSCORE_DATA_DIR at a temp dir regardless of import
 * hoisting order.
 */
export class MemoryStorage implements Storage {
  readonly kind = "memory" as const;
  private data: Snapshot = { listings: [], scrapeHistory: [] };
  private readonly dataFile: string;
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir =
      dataDir ?? process.env.CARSCORE_DATA_DIR ?? path.join(__dirname, "..", "..", ".data");
    this.dataFile = path.join(this.dataDir, "db.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.dataFile, "utf8");
      this.data = JSON.parse(raw) as Snapshot;
    } catch {
      this.data = { listings: [], scrapeHistory: [] };
      await this.flush();
    }
    // One-time cleanup: drop any previously-seeded demo listings so the app
    // shows scraped inventory only.
    const before = this.data.listings.length;
    this.data.listings = this.data.listings.filter((l) => !SEED_DEDUPE_KEYS.has(l.dedupeKey));
    let dirty = this.data.listings.length !== before;

    // Bring stored rows onto the current identity scheme. Without this, rows
    // written under the old key would never match a freshly scraped listing and
    // the next run would duplicate the whole inventory. Non-destructive: every
    // row survives, so a mistake here can never cost inventory.
    const rekey = rekeyListings(this.data.listings);
    if (rekey.rekeyed > 0) {
      this.data.listings = rekey.listings;
      dirty = true;
      // eslint-disable-next-line no-console
      console.log(
        `Listing keys migrated: ${rekey.rekeyed} re-keyed, ${rekey.collisions} left on old key. ` +
          `${rekey.listings.length} row(s) retained.`
      );
    }

    if (dirty) await this.flush();
  }

  private async flush(): Promise<void> {
    await fs.writeFile(this.dataFile, JSON.stringify(this.data, null, 2), "utf8");
  }

  async getAllListings(): Promise<Listing[]> {
    return this.data.listings;
  }

  async getListingById(id: string): Promise<Listing | null> {
    return this.data.listings.find((l) => l.id === id) ?? null;
  }

  async upsertListings(incoming: Listing[]): Promise<UpsertResult> {
    // Never trust a caller-supplied dedupeKey — derive it here. See withCurrentKeys.
    const listings = withCurrentKeys(incoming);
    const byKey = new Map(this.data.listings.map((l) => [l.dedupeKey, l]));
    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();
    for (const l of listings) {
      const existing = byKey.get(l.dedupeKey);
      if (existing) {
        existing.lastSeenAt = now;
        existing.price = l.price;
        existing.mileageKm = l.mileageKm ?? existing.mileageKm;
        existing.listingUrl = l.listingUrl ?? existing.listingUrl;
        existing.image = l.image ?? existing.image;
        updated++;
      } else {
        byKey.set(l.dedupeKey, l);
        this.data.listings.push(l);
        inserted++;
      }
    }
    await this.flush();
    return { inserted, updated };
  }

  async countListings(): Promise<number> {
    return this.data.listings.length;
  }

  async addScrapeHistory(entry: ScrapeHistoryEntry): Promise<void> {
    this.data.scrapeHistory.unshift(entry);
    this.data.scrapeHistory = this.data.scrapeHistory.slice(0, 50);
    await this.flush();
  }

  async updateScrapeHistory(entry: ScrapeHistoryEntry): Promise<void> {
    const i = this.data.scrapeHistory.findIndex((e) => e.id === entry.id);
    if (i >= 0) this.data.scrapeHistory[i] = entry;
    await this.flush();
  }

  async getScrapeHistory(limit: number): Promise<ScrapeHistoryEntry[]> {
    return this.data.scrapeHistory.slice(0, limit);
  }

  async getLastCompletedScrape(): Promise<ScrapeHistoryEntry | null> {
    return this.data.scrapeHistory.find((e) => e.status !== "running") ?? null;
  }
}
