import { promises as fs } from "fs";
import path from "path";
import { Listing, ScrapeHistoryEntry } from "../types";
import { Storage, UpsertResult } from "./storage";
import { SEED_LISTINGS } from "./seed";

interface Snapshot {
  listings: Listing[];
  scrapeHistory: ScrapeHistoryEntry[];
}

const DATA_DIR = path.join(__dirname, "..", "..", ".data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

/**
 * JSON-file-backed storage used when no MONGODB_URI is configured.
 * Persists across restarts; seeds itself on first run.
 */
export class MemoryStorage implements Storage {
  readonly kind = "memory" as const;
  private data: Snapshot = { listings: [], scrapeHistory: [] };

  async init(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      this.data = JSON.parse(raw) as Snapshot;
    } catch {
      this.data = { listings: [...SEED_LISTINGS], scrapeHistory: [] };
      await this.flush();
    }
    if (this.data.listings.length === 0) {
      this.data.listings = [...SEED_LISTINGS];
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    await fs.writeFile(DATA_FILE, JSON.stringify(this.data, null, 2), "utf8");
  }

  async getAllListings(): Promise<Listing[]> {
    return this.data.listings;
  }

  async getListingById(id: string): Promise<Listing | null> {
    return this.data.listings.find((l) => l.id === id) ?? null;
  }

  async upsertListings(listings: Listing[]): Promise<UpsertResult> {
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
