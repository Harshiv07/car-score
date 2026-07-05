import express from "express";
import cors from "cors";
import { listingsRouter } from "./routes/listings";
import { scrapeRouter } from "./routes/scrape";
import { metaRouter } from "./routes/meta";
import { newCarsRouter } from "./routes/newcars";
import { getStorage } from "./db/storage";

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  const storage = await getStorage();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, storage: storage.kind });
  });
  // Alias for hosts (Render, k8s, etc.) that default their health check to /healthz.
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, storage: storage.kind });
  });
  app.use("/api/listings", listingsRouter);
  app.use("/api/scrape", scrapeRouter);
  app.use("/api/meta", metaRouter);
  app.use("/api/newcars", newCarsRouter);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `CarScore API listening on :${PORT} (storage: ${storage.kind}${
        storage.kind === "memory" ? " — set MONGODB_URI for MongoDB" : ""
      })`
    );
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", e);
  process.exit(1);
});
