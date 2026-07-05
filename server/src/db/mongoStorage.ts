import mongoose, { Schema, model, Model } from "mongoose";
import { Listing, ScrapeHistoryEntry } from "../types";
import { Storage, UpsertResult } from "./storage";
import { SEED_DEDUPE_KEYS } from "./seed";
import { VEHICLE_MODELS } from "../data/vehicleModels";

/**
 * MongoDB driver (production path). Collections:
 *   listings, vehiclemodels, recalls, scoringprofiles, scrapehistories
 * Vehicle models / recalls / scoring profile are synced from the in-repo
 * knowledge base on startup so the DB always reflects the shipped data.
 */

const listingSchema = new Schema<Listing>(
  {
    id: { type: String, required: true, unique: true, index: true },
    dedupeKey: { type: String, required: true, unique: true, index: true },
    title: String,
    make: { type: String, index: true },
    model: { type: String, index: true },
    trim: { type: String, default: null },
    year: { type: Number, index: true },
    drivetrain: String,
    engine: { type: String, default: null },
    transmission: { type: String, default: null },
    fuelType: String,
    vin: { type: String, default: null },
    price: { type: Number, index: true },
    mileageKm: { type: Number, default: null },
    fuelEconomy: { type: Number, default: null },
    exteriorColour: { type: String, default: null },
    interiorColour: { type: String, default: null },
    dealer: { type: String, default: null },
    isDealer: Boolean,
    city: { type: String, default: null },
    province: { type: String, default: null },
    sourceWebsite: String,
    listingUrl: { type: String, default: null },
    image: { type: String, default: null },
    cpo: Boolean,
    warrantyMonths: { type: Number, default: null },
    warrantyNote: { type: String, default: null },
    carfaxAvailable: Boolean,
    accidentReported: { type: Boolean, default: null },
    recalls: [String],
    features: [String],
    firstSeenAt: String,
    lastSeenAt: String,
  },
  { versionKey: false }
);

const scrapeHistorySchema = new Schema<ScrapeHistoryEntry>(
  {
    id: { type: String, required: true, unique: true },
    startedAt: String,
    finishedAt: { type: String, default: null },
    status: String,
    totalFound: Number,
    totalInserted: Number,
    totalUpdated: Number,
    sources: [{ source: String, found: Number, ok: Boolean, note: String }],
  },
  { versionKey: false }
);

const vehicleModelSchema = new Schema({}, { strict: false, versionKey: false });
const recallSchema = new Schema({}, { strict: false, versionKey: false });
const scoringProfileSchema = new Schema({}, { strict: false, versionKey: false });

export class MongoStorage implements Storage {
  readonly kind = "mongo" as const;
  private ListingM!: Model<Listing>;
  private ScrapeHistoryM!: Model<ScrapeHistoryEntry>;

  constructor(private uri: string) {}

  async init(): Promise<void> {
    await mongoose.connect(this.uri);
    this.ListingM = model<Listing>("Listing", listingSchema);
    this.ScrapeHistoryM = model<ScrapeHistoryEntry>("ScrapeHistory", scrapeHistorySchema);
    const VehicleModelM = model("VehicleModel", vehicleModelSchema);
    const RecallM = model("Recall", recallSchema);
    const ScoringProfileM = model("ScoringProfile", scoringProfileSchema);

    // Sync reference collections from the shipped knowledge base.
    await VehicleModelM.deleteMany({});
    await VehicleModelM.insertMany(VEHICLE_MODELS);
    await RecallM.deleteMany({});
    await RecallM.insertMany(
      VEHICLE_MODELS.flatMap((m) =>
        m.recallsAndIssues.issues.map((i) => ({ make: m.make, model: m.model, ...i }))
      )
    );
    await ScoringProfileM.updateOne(
      { name: "default" },
      {
        $set: {
          name: "default",
          weights: {
            reliability: 20, marketValue: 20, ownership: 15, winter: 10, safety: 10,
            mileage: 10, resale: 5, recalls: 5, warranty: 3, features: 2,
          },
        },
      },
      { upsert: true }
    );

    // One-time cleanup: remove any previously-seeded demo listings so the app
    // shows scraped inventory only. (No longer seeds on an empty DB.)
    await this.ListingM.deleteMany({ dedupeKey: { $in: [...SEED_DEDUPE_KEYS] } });
  }

  async getAllListings(): Promise<Listing[]> {
    return this.ListingM.find().lean<Listing[]>();
  }

  async getListingById(id: string): Promise<Listing | null> {
    return this.ListingM.findOne({ id }).lean<Listing>();
  }

  async upsertListings(listings: Listing[]): Promise<UpsertResult> {
    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();
    for (const l of listings) {
      const existing = await this.ListingM.findOne({ dedupeKey: l.dedupeKey }).lean<Listing>();
      if (existing) {
        const set: Partial<Listing> = { lastSeenAt: now, price: l.price };
        if (l.mileageKm != null) set.mileageKm = l.mileageKm;
        if (l.listingUrl != null) set.listingUrl = l.listingUrl;
        if (l.image != null) set.image = l.image;
        await this.ListingM.updateOne({ dedupeKey: l.dedupeKey }, { $set: set });
        updated++;
      } else {
        await this.ListingM.create(l);
        inserted++;
      }
    }
    return { inserted, updated };
  }

  async countListings(): Promise<number> {
    return this.ListingM.countDocuments();
  }

  async addScrapeHistory(entry: ScrapeHistoryEntry): Promise<void> {
    await this.ScrapeHistoryM.create(entry);
  }

  async updateScrapeHistory(entry: ScrapeHistoryEntry): Promise<void> {
    await this.ScrapeHistoryM.updateOne({ id: entry.id }, { $set: entry });
  }

  async getScrapeHistory(limit: number): Promise<ScrapeHistoryEntry[]> {
    return this.ScrapeHistoryM.find().sort({ startedAt: -1 }).limit(limit).lean<ScrapeHistoryEntry[]>();
  }

  async getLastCompletedScrape(): Promise<ScrapeHistoryEntry | null> {
    return this.ScrapeHistoryM.findOne({ status: { $ne: "running" } })
      .sort({ startedAt: -1 })
      .lean<ScrapeHistoryEntry>();
  }
}
