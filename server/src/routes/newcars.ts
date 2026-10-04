import { Router } from "express";
import { getNewCars } from "../newcars/service";
import { asyncHandler } from "../util/http";

export const newCarsRouter = Router();

/** GET /api/newcars — current-model lineup scraped from official OEM sites. */
newCarsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const force = req.query.refresh === "1";
    res.json(await getNewCars(force));
  })
);
