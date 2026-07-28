import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { listingsRouter } from "./routes/listings";
import { scrapeRouter } from "./routes/scrape";
import { metaRouter } from "./routes/meta";
import { newCarsRouter } from "./routes/newcars";
import { getStorage } from "./db/storage";

const PORT = Number(process.env.PORT ?? 4000);

/**
 * Allowed browser origins. `CORS_ORIGIN` takes a comma-separated list; with it
 * unset we stay open, which is right for local dev and for a public read-only
 * API, but production deployments should pin it to the client origin.
 */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const storage = await getStorage();
  const app = express();

  // Behind Render/Vercel/any reverse proxy, rate limiting and logging need the
  // real client IP rather than the proxy's. Trust exactly one hop, not `true`
  // — a blanket trust lets a client spoof X-Forwarded-For and dodge limits.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security headers. The API serves JSON to a separate origin and embeds
  // nothing, so the restrictive resource policy costs us nothing.
  app.use(
    helmet({
      contentSecurityPolicy: false, // no HTML is served from here
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  app.use(compression());

  app.use(
    cors({
      origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
      methods: ["GET", "POST"],
      maxAge: 86_400,
    })
  );

  // Nothing here accepts a large body; cap it so a bad request can't buffer MBs.
  app.use(express.json({ limit: "32kb" }));

  // Baseline limit for reads.
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests — slow down and try again shortly." },
    })
  );

  const health = (_req: express.Request, res: express.Response) =>
    res.json({ ok: true, storage: storage.kind });
  app.get("/api/health", health);
  // Alias for hosts (Render, k8s, etc.) that default their health check to /healthz.
  app.get("/healthz", health);

  app.use("/api/listings", listingsRouter);
  // Starting a crawl is the one expensive, outbound-traffic-generating action
  // in the API. It already has a 10-minute cooldown, but that's keyed on run
  // state, not on the caller — this bounds the request rate itself.
  app.use(
    "/api/scrape",
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many scrape requests — slow down and try again shortly." },
    }),
    scrapeRouter
  );
  app.use("/api/meta", metaRouter);
  app.use("/api/newcars", newCarsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Last-resort handler. Client errors (an oversized or malformed body) keep
  // their real status so the caller can tell what they did wrong; server errors
  // are masked, because leaking stack traces or driver messages tells an
  // attacker about the stack for no benefit to a legitimate caller.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = (err as { status?: number; statusCode?: number }).status ??
      (err as { statusCode?: number }).statusCode ?? 500;

    if (status >= 400 && status < 500) {
      res.status(status).json({ error: status === 413 ? "Request body too large" : "Bad request" });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

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
