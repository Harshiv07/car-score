import { Router } from "express";
import { VEHICLE_MODELS } from "../data/vehicleModels";
import { getStorage } from "../db/storage";

export const metaRouter = Router();

/**
 * GET /api/meta — filter options for the UI: supported brands/models,
 * plus the provinces/cities/sources actually present in the inventory.
 */
metaRouter.get("/", async (_req, res) => {
  try {
    const storage = await getStorage();
    const listings = await storage.getAllListings();
    const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();

    // Filter options change only when inventory does.
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
    res.json({
      brands: uniq(VEHICLE_MODELS.map((m) => m.make)),
      models: VEHICLE_MODELS.map((m) => ({ make: m.make, model: m.model, body: m.body })),
      provinces: uniq(listings.map((l) => l.province)),
      cities: uniq(listings.map((l) => l.city)),
      sources: uniq(listings.map((l) => l.sourceWebsite)),
      drivetrains: ["AWD", "FWD", "RWD", "4WD"],
      fuelTypes: ["Gas", "Hybrid", "Diesel", "Electric"],
      sortOptions: [
        { key: "score", label: "Best Score" },
        { key: "deal", label: "Best Deal" },
        { key: "mileage", label: "Lowest Mileage" },
        { key: "price", label: "Lowest Price" },
        { key: "reliability", label: "Highest Reliability" },
        { key: "newest", label: "Newest" },
        { key: "resale", label: "Best Resale" },
      ],
      storage: storage.kind,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
