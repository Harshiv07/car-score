import { Router, Request } from "express";
import { ListingFilters, SortKey } from "../types";
import {
  applyFilters,
  filterActive,
  findAlternatives,
  getScoredListings,
  inventoryStats,
  ownershipEstimate,
  sortListings,
} from "../services/listingService";
import { getModelInfo } from "../data/vehicleModels";
import { getRecallHistory } from "../services/recallService";

export const listingsRouter = Router();

/**
 * Inventory is refreshed by a crawl at most once every ten minutes, so a read
 * can be a little stale without being wrong. `stale-while-revalidate` lets the
 * browser paint instantly from cache on a back-navigation or a re-filter while
 * it refreshes underneath — which is most of what made moving around the app
 * feel slow, since every view previously waited on a fresh round trip.
 */
const READ_CACHE = "public, max-age=30, stale-while-revalidate=300";

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

/**
 * `?keys=a,b,c` — fetch specific listings by dedupeKey.
 *
 * The saved-cars page needs the listings behind a set of saved keys regardless
 * of where they rank. It used to pull the first 100 by score and filter client
 * side, so a car saved at rank 500 simply vanished from the page — and the
 * prune-missing-favourites step then deleted it for good. Capped so the
 * parameter can't be used to request unbounded work.
 */
const MAX_KEYS = 200;

function parseKeys(req: Request): string[] | undefined {
  const raw = strq(req.query.keys);
  if (!raw) return undefined;
  return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_KEYS);
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
    const keys = parseKeys(req);
    // A specific key lookup (favourites) resolves regardless of staleness —
    // see filterActive()'s doc comment for why that matters. Staleness only
    // hides listings from open-ended discovery.
    const active = filterActive(all);
    const scoped = keys ? all.filter((l) => keys.includes(l.dedupeKey)) : active;
    const filtered = applyFilters(scoped, parseFilters(req));
    const sortRaw = strq(req.query.sort) ?? "score";
    const sort: SortKey = (SORT_KEYS as string[]).includes(sortRaw) ? (sortRaw as SortKey) : "score";
    const sorted = sortListings(filtered, sort);

    const page = Math.max(1, num(req.query.page) ?? 1);
    const pageSize = Math.min(100, Math.max(1, num(req.query.pageSize) ?? 50));
    const start = (page - 1) * pageSize;

    res.set("Cache-Control", READ_CACHE);
    res.json({
      total: sorted.length,
      totalUnfiltered: keys ? all.length : active.length,
      page,
      pageSize,
      sort,
      listings: sorted.slice(start, start + pageSize),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * GET /api/listings/stats — inventory-wide aggregates for the header.
 * Registered before `/:id` so "stats" isn't parsed as a listing id.
 */
listingsRouter.get("/stats", async (_req, res) => {
  try {
    const all = await getScoredListings();
    res.set("Cache-Control", READ_CACHE);
    res.json(inventoryStats(filterActive(all)));
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
    res.set("Cache-Control", READ_CACHE);
    res.json({
      listing,
      ownership: ownershipEstimate(listing),
      recallHistory: getRecallHistory(listing.make, listing.model, listing.year),
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
