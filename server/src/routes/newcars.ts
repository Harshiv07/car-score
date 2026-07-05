import { Router } from "express";
import { getNewCars } from "../newcars/service";

export const newCarsRouter = Router();

/** GET /api/newcars — current-model lineup scraped from official OEM sites. */
newCarsRouter.get("/", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    const result = await getNewCars(force);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
