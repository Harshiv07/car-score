import { Router } from "express";
import { getProgress, startScrape } from "../services/scrapeService";
import { getStorage } from "../db/storage";
import { verifyPipeline } from "../services/selfCheck";
import { asyncHandler } from "../util/http";

export const scrapeRouter = Router();

/** GET /api/scrape/selfcheck — is the extract→normalize→score pipeline healthy? */
scrapeRouter.get("/selfcheck", (_req, res) => {
  const report = verifyPipeline();
  res.status(report.ok ? 200 : 500).json(report);
});

/** POST /api/scrape — kick off a crawler run (409 if running or cooling down). */
scrapeRouter.post(
  "/",
  asyncHandler(async (_req, res) => {
    const result = await startScrape();
    if (!result.started) {
      res.status(409).json({
        error:
          result.reason === "running"
            ? "A scrape is already running."
            : `Cooldown active — try again in ${Math.ceil(result.cooldownSecondsRemaining / 60)} min.`,
        ...result,
      });
      return;
    }
    res.status(202).json(result);
  })
);

/** GET /api/scrape/status — progress, live logs, cooldown state. */
scrapeRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json(await getProgress());
  })
);

/** GET /api/scrape/history — past runs. */
scrapeRouter.get(
  "/history",
  asyncHandler(async (_req, res) => {
    const storage = await getStorage();
    res.json(await storage.getScrapeHistory(20));
  })
);
