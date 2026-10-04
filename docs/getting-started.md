# Getting started

```bash
npm run setup             # npm install + downloads Chromium for the browser fallback
npm run dev               # API on :4000, app on :3000 (proxied /api)
npm test -w server        # 120 unit + pipeline tests (no network needed)
npm run test:e2e          # Playwright e2e UI tests (boots API + client itself)
npm run recalls:build -w server       # refresh server/src/data/recalls.generated.json
                                      #   (Transport Canada recall data)
npm run dealer:probe -w server        # probe a dealer site to see which platform it runs
npm run scrape:check -w server          # confirm the pipeline is healthy (no network)
npm run scrape:check -w server -- --live # + probe each source over the network
npm run scrape:snapshot -w server    # run every scraper once, write real results to
                                      #   server/src/data/listingsSnapshot.json
npm run db:seed-snapshot -w server   # load that snapshot into whatever storage is
                                      #   configured (safe to re-run — upserts)
```

No database needed for development — without `MONGODB_URI` the server uses a
local JSON-file store (`server/.data/db.json`), empty until a scrape (or
`db:seed-snapshot`) populates it — the app never auto-seeds fabricated demo
data, only real scraped listings.

> **The two anchor sources are browser-free.** `AutoTrader.ca` (Ontario, Quebec
> and Manitoba — see below — paged
> via its embedded `__NEXT_DATA__` JSON) and `Clutch.ca` (a combined API query
> across every supported model) together return **1,000+ listings per run**
> with **no browser required** — they work on Render and other hosts without
> Chromium.
>
> **Some sites need a browser.** A couple of JS dealer sites block a plain
> server-side fetch outright, and Clutch falls back to it for models the WAF
> challenges (see `clutch.ts`'s docblock). Locally, `npm run setup` installs
> Chromium for you. On Render, this needs the **Docker** runtime (see
> `./Dockerfile` + `render.yaml`) — Render's *native* Node runtime build
> sandbox has no apt/root access, so `playwright install --with-deps` could
> download the Chromium binary but not its shared-library dependencies; the
> browser ended up on disk but failed to *launch* at runtime (confirmed live
> in production: "Chromium is not installed (or can't launch)"). A Docker
> build runs as root, so the same install genuinely works there. It's still
> best-effort by design: if the free-tier instance can't spare the memory to
> launch Chromium alongside the Node process, every browser-dependent path
> no-ops cleanly and the rest of the scrape is unaffected.
>
> **CarGurus is best-effort, on purpose.** It sits behind DataDome, which
> blocks primarily on IP reputation, not bot fingerprint — three different
> open-source techniques were verified live and all three got an identical
> 403 from the same IP: plain Playwright, Crawlee's `PlaywrightCrawler` with
> realistic fingerprint injection, and `playwright-extra` +
> `puppeteer-extra-plugin-stealth` (CDP-signature patching, the same category
> of technique `undetected-chromedriver`/Selenium and `crawl4ai` use). None of
> them change the one thing that actually matters — the IP the request comes
> from — so none were kept as a dependency; there's no free substitute for a
> paid non-datacenter proxy here. `cargurus.ts` keeps the real, verified
> reverse-engineering work (the exact per-model search URLs, and a parser for
> the Remix-app data CarGurus's current site embeds — see the file's
> docblock) wired to the same free browser fallback every other JS source
> uses, and fails fast: it tries one model, and only spends time on the
> other 9 if that one actually returns real data.
>
> **A run can never hang.** The whole run is capped at `SCRAPE_RUN_BUDGET_MS`
> (8 min — Clutch's browser-session tiers can each take 30-45s to launch
> Chromium, and AutoTrader alone needs ~90s) and each source at
> `SCRAPE_SOURCE_TIMEOUT_MS` (90 s — CarGurus's
> per-model browser renders take real wall-clock time on the rare unblocked
> run); tune sources and page counts via env vars (see `server/.env.example`). The
> API keeps serving listings while a scrape is in progress.

## Production (MongoDB)

```bash
MONGODB_URI="mongodb+srv://…" npm run start   # after npm run build
```

On startup the server syncs the `VehicleModels`, `Recalls` and
`ScoringProfiles` collections from the in-repo knowledge base and seeds
`Listings` if empty. `ScrapeHistory` records every crawler run.
