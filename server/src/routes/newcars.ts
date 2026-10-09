import { Router } from "express";
import { getNewCars } from "../newcars/catalog";

export const newCarsRouter = Router();

/**
 * GET /api/newcars: the curated current-model lineup with Canadian MSRPs.
 *
 * Served from memory (the file is validated at boot) and cacheable: it changes
 * when someone edits the data file and redeploys, not between requests.
 */
newCarsRouter.get("/", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  res.json(getNewCars());
});
