import { Router } from "express";
import { getProgress, startScrape } from "../services/scrapeService";
import { getStorage } from "../db/storage";
import { verifyPipeline } from "../services/selfCheck";

export const scrapeRouter = Router();

/** GET /api/scrape/selfcheck — is the extract→normalize→score pipeline healthy? */
scrapeRouter.get("/selfcheck", (_req, res) => {
  const report = verifyPipeline();
  res.status(report.ok ? 200 : 500).json(report);
});

/** POST /api/scrape — kick off a crawler run (409 if running or cooling down). */
scrapeRouter.post("/", async (_req, res) => {
  try {
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
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/scrape/status — progress, live logs, cooldown state. */
scrapeRouter.get("/status", async (_req, res) => {
  try {
    res.json(await getProgress());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/scrape/history — past runs. */
scrapeRouter.get("/history", async (_req, res) => {
  try {
    const storage = await getStorage();
    res.json(await storage.getScrapeHistory(20));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
