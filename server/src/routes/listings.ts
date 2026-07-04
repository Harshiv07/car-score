import { Router, Request } from "express";
import { ListingFilters, SortKey } from "../types";
import {
  applyFilters,
  findAlternatives,
  getScoredListings,
  ownershipEstimate,
  sortListings,
} from "../services/listingService";
import { getModelInfo } from "../data/vehicleModels";

export const listingsRouter = Router();

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function strq(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}
function bool(v: unknown): boolean | undefined {
  if (v === "true" || v === "1") return true;
  return undefined;
}

function parseFilters(req: Request): ListingFilters {
  const q = req.query;
  return {
    priceMin: num(q.priceMin),
    priceMax: num(q.priceMax),
    yearMin: num(q.yearMin),
    yearMax: num(q.yearMax),
    mileageMax: num(q.mileageMax),
    make: strq(q.make),
    model: strq(q.model),
    province: strq(q.province),
    city: strq(q.city),
    drivetrain: strq(q.drivetrain),
    fuelType: strq(q.fuelType),
    cpoOnly: bool(q.cpoOnly),
    dealerOnly: bool(q.dealerOnly),
    sourceWebsite: strq(q.source),
    scoreMin: num(q.scoreMin),
    scoreMax: num(q.scoreMax),
  };
}

const SORT_KEYS: SortKey[] = ["score", "deal", "mileage", "price", "reliability", "newest", "resale"];

/** GET /api/listings — filtered, sorted, paginated leaderboard. */
listingsRouter.get("/", async (req, res) => {
  try {
    const all = await getScoredListings();
    const filtered = applyFilters(all, parseFilters(req));
    const sortRaw = strq(req.query.sort) ?? "score";
    const sort: SortKey = (SORT_KEYS as string[]).includes(sortRaw) ? (sortRaw as SortKey) : "score";
    const sorted = sortListings(filtered, sort);

    const page = Math.max(1, num(req.query.page) ?? 1);
    const pageSize = Math.min(100, Math.max(1, num(req.query.pageSize) ?? 50));
    const start = (page - 1) * pageSize;

    res.json({
      total: sorted.length,
      totalUnfiltered: all.length,
      page,
      pageSize,
      sort,
      listings: sorted.slice(start, start + pageSize),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/listings/:id — full detail: score breakdown, ownership estimate, alternatives. */
listingsRouter.get("/:id", async (req, res) => {
  try {
    const all = await getScoredListings();
    const listing = all.find((l) => l.id === req.params.id);
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    const info = getModelInfo(listing.make, listing.model);
    res.json({
      listing,
      ownership: ownershipEstimate(listing),
      modelInfo: info
        ? {
            body: info.body,
            reliabilitySummary: info.reliability.summary,
            adasNote: info.safety.adasNote,
            knownIssues: info.recallsAndIssues.issues,
            typicalFeatures: info.typicalFeatures,
          }
        : null,
      alternatives: findAlternatives(listing, all),
      externalLinks: buildExternalLinks(listing),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

function buildExternalLinks(l: { make: string; model: string; vin: string | null; listingUrl: string | null }) {
  const slug = `${l.make}/${l.model}`.toLowerCase().replace(/\s+/g, "-").replace("mazda/mazda3", "mazda/3");
  const links: { label: string; url: string }[] = [];
  if (l.listingUrl) links.push({ label: "Original listing", url: l.listingUrl });
  links.push({ label: "AutoTrader.ca search", url: `https://www.autotrader.ca/cars/${slug}/` });
  links.push({ label: "CarGurus.ca search", url: `https://www.cargurus.ca/` });
  if (l.vin) links.push({ label: "CARFAX Canada (VIN)", url: `https://www.carfax.ca/vehicle-history-report?vin=${l.vin}` });
  return links;
}
