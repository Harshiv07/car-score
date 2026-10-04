# CarScore V2

A production-quality web app for **first-time Canadian car buyers**: it collects
used-car listings from multiple websites, evaluates every vehicle with a hybrid
**100-point scoring engine**, and ranks the best-value cars — prioritizing
**reliability, value for money, winter driving and ownership cost** instead of
just the cheapest price.

```
React (TypeScript, Tailwind, React Query, React Router)   → Vercel
        ↓  REST API
Node (Express)                                            → Render (Docker)
        ↓
Crawler service (Crawlee + Cheerio, Playwright fallback only)
        ↓
MongoDB (Mongoose) — or a built-in file store for zero-config dev
```

## What's in the app

| Page | What it does |
| ---- | ------------ |
| **Leaderboard** (`/`) | Ranked listings with filters, 7 sort modes, pagination with scroll-reveal, and a **Top Pick** hero stating the best car for the current query. Every card gives a one-line *why* built only from what the engine scored. The hero and the detail page show a lazy-loaded **3D score ring** (Three.js + GSAP) — each scoring category is an arc you can drag, hover or arrow-key through, with a plain-text fallback when WebGL is unavailable and reduced-motion support. |
| **Listing detail** (`/listing/:id`) | Full 100-point breakdown, market comparison, ownership and **monthly payment** estimate (province-aware tax, rate and term), Transport Canada **recall history**, known issues, pros/cons, alternatives and links to the seller. |
| **Compare** (`/compare`) | Up to three cars side by side, category by category. The comparison set lives in `sessionStorage` — it's a decision you're making now. |
| **Favourites** (`/favorites`) | Cars you've hearted, saved in this browser (`localStorage`, synced across tabs). |
| **New cars** (`/new-cars`) | Current-model lineup scraped from official OEM sites. |
| **Guide** (`/guide`) | A first-car buyer's guide: what it really costs, who is selling it, the three meanings of "certified", the walkaround, tyres, rust, test drive, paperwork, inspection, negotiating, when to walk away. |

Electric listings get an **EVAP-eligible** badge on cards and the detail page (federal
EV Affordability Program, BEV/FCEV tier only — see `data/evapEligibility.ts` for what it
does and doesn't claim). Also: light/dark theme switch, a **Refresh Listings** control with live scrape
logs and a cooldown timer, and a cold-start notice — the API sleeps on Render's
free tier, so returning visitors repaint instantly from cached results and
first-timers are told why the first load is slow instead of staring at a spinner.

## Supported models

Only these are scraped and scored:

| Brand   | Models              |
| ------- | ------------------- |
| Toyota  | Corolla, RAV4       |
| Honda   | Civic, CR-V         |
| Mazda   | Mazda3, CX-5        |
| Hyundai | Elantra, Tucson     |
| Subaru  | Forester, Crosstrek |

## Quick start

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

### Production (MongoDB)

```bash
MONGODB_URI="mongodb+srv://…" npm run start   # after npm run build
```

On startup the server syncs the `VehicleModels`, `Recalls` and
`ScoringProfiles` collections from the in-repo knowledge base and seeds
`Listings` if empty. `ScrapeHistory` records every crawler run.

## Scraping

All scraping is **backend-only** (no CORS issues, nothing in React). Each
source has its own module returning a common `Listing[]` interface:

```
server/src/scrapers/
  clutch.ts        # Clutch.ca — public JSON API (browser-free)
  convertus.ts     # Convertus VMS dealers (Wayne Toyota, Superior Hyundai) — browser-free JSON proxy
  stmMotors.ts     # STM Motors dealers (Gore Motors) — browser-free via listings-sitemap.xml
  edealer.ts       # eDealer-platform dealers (Half-Way Motors Mazda) — browser-free, embedded JS object
  autotrader.ts    # AutoTrader.ca — browser-free, paged via embedded __NEXT_DATA__ (ON/QC/MB)
  cargurus.ts      # CarGurus.ca — browser-rendered, best-effort (DataDome)
  dealer.ts        # dealership sites, configurable via src/config/dealers.json
  config.ts        # env-driven run budget, timeouts, source allow-list
```

**Browser-free sources (work everywhere, incl. Render).** Each `dealers.json`
entry has a `platform`:
- **Clutch.ca** — public JSON API, queried as **one combined request listing
  all 5 makes + 10 supported models at once**, then paginated. The API returns
  each page as a mix of every requested model (a single query's `totalCount`
  is ~750-800 across the supported models, and page 0 alone already spans
  RAV4/CR-V/CX-5/Elantra/Corolla/Civic/…), so every model gets *some* coverage
  from every run. This replaced an earlier per-model-query design: api.clutch.ca
  sits behind an AWS WAF that allows only **~6-8 requests total per run**
  before returning an empty HTTP 202 challenge (confirmed live, including on
  the deployed Render host — pacing 400ms vs 3000ms between requests made zero
  difference, so it's a request-COUNT budget, not a rate limit pacing can work
  around). `CLUTCH_MAX_PAGES` (default **3**) deliberately stops the combined
  query early — verified live it was otherwise spending the *entire* budget on
  breadth and leaving nothing for the next step — so most of the tiny budget
  is reserved for `topUpUnderrepresentedModels`: one single-model request per
  model that's still short (most-deficient first), since a shared request for
  multiple thin models just reproduces the same cross-model skew inside that
  smaller subset (verified live), while a single-model request gets an entire
  page to itself and reliably returns that model's real count.
  On a host with a real browser (local dev with Chromium — **not** Render
  today, confirmed live: "Chromium is not installed"), a bonus tier continues
  the combined-query pagination from inside a WAF-cleared browser page, and
  the top-up step gets two further fallbacks reusing that same session: an
  in-page `fetch()`, then — if that's also blocked — a genuine navigation to
  the model's own product page (`clutch.ca/cars/{make}-{model}`) with vehicle
  cards read straight off the rendered DOM. That last tier isn't a different
  data source (the page populates itself via the same API call), but a full
  navigation is a different request pattern than an injected fetch and was
  verified live to succeed — Forester 13/13, Mazda3 31/31 — after the other
  two tiers had already been blocked in the same run.
- **`convertus`** (Wayne Toyota, Superior Hyundai) — the dealer site's own
  same-origin `convertus-vms/…/ajax-vehicles.php` proxy (set each dealer's `cp`
  company id).
- **`stm`** (Gore Motors) — the WordPress Motors theme publishes a
  `listings-sitemap.xml`; we read the per-vehicle pages it lists (slug carries
  year-make-model, page carries price + mileage).
- **`edealer`** (Half-Way Motors Mazda) — the used-inventory page embeds the
  whole lot as a `var vehicleArray = {...}` JS object literal directly in the
  static HTML; no rendering needed. These sites commonly serve a shared
  multi-brand feed (a dealer group's used lot mixes trade-ins across sibling
  stores on one page), so each vehicle is attributed to its own `dealerName`
  rather than the configured dealer's name.

All return complete, structured vehicles (year, price, km, VIN where available,
drivetrain, fuel).

**AutoTrader** (`autotrader.ts`) is the largest source (1,000+ listings per run
across Ontario, Quebec and Manitoba — the provinces a Thunder Bay buyer can
realistically drive to; set `AUTOTRADER_PROVINCES` to widen or narrow it) and is fully browser-free. AutoTrader.ca is a Next.js app (AutoScout24
backend) whose server-rendered HTML embeds a clean, fully-structured
`"listings":[…]` array inside `__NEXT_DATA__` — real year/price/km/trim/fuel/
transmission plus the listing's true province and city, and a working VDP url.
Two things make this scale, both verified live: pagination works browser-free
via `&page=N` (each page is a genuinely different set of listings — the older
`rcs=` param does *not* paginate, which is why the previous tile-based
approach was stuck at ~20 listings per model regardless of requested page
size), and dropping the `prx=-1` "national" param scopes results to the province in
the URL path server-side. `AUTOTRADER_PAGES_PER_MODEL` (default 6) controls how many pages
per model to fetch (per province); fetching is two-phase — page 1 of every model first, then
page 2..N interleaved across models up to each model's real page count — so a
low-volume model never starves a high-volume one's depth or vice versa.
`modelVersionInput` (the closest thing to a "trim" field) is dealer free text
and often marketing copy rather than a real trim (`"RAV4 Blowout Sale - 30+ in
stock"`); it's sanitized to the first clean segment, with any drivetrain token
(AWD/FWD/…) pulled out before the cleanup so it isn't lost. The older visible-
tile text parser (`parseAutotraderTiles`) is kept as a fallback for any page
where the `__NEXT_DATA__` blob can't be extracted (a future markup change).

**Model matching** (`matchModelFromTitle` in `data/vehicleModels.ts`) uses
word-boundary-aware alias matching, not a plain substring check — a real
Mazda **CX-50** was being mismatched as our **CX-5** because `"cx-50"` simply
contains `"cx-5"` as a text prefix. A couple of same-nameplate-different-model
collisions (e.g. Toyota **Corolla Cross**, a different Toyota model/platform
from the Corolla we score) need an explicit exclusion since both spans are
genuinely word-bounded; see `FALSE_POSITIVE_FOLLOWERS`.

**CarGurus** (`cargurus.ts`) is queried per model via CarGurus's own
`makeModelTrimPaths` filter (an internal make/model id pair, e.g. `m7/d306`
for Toyota RAV4; resolved live, see `MODEL_PATHS`), not an unfiltered "used
cars near X" search, since an unfiltered page returns whatever the sort order
surfaces first — mostly not our 10 supported models. Rendered through the same
free browser fallback (`renderPage()`) every other JS source uses, and parsed
from the page's embedded Remix router context (`window.__remixContext…
state.loaderData["routes/($intl).search"].search.tiles`) — the current
cargurus.ca is a Remix app, so the listings aren't in JSON-LD or any of
extract.ts's generic strategies. There is no browser-free path to this data:
the search endpoint, the sitemap and the sitemap index are all DataDome-403,
the homepage embeds no listing data, and an individual VDP link returns a
data-less stub (all checked live). So only the *first* model is tried up
front; the other 9 only run if that one actually returns real data, to avoid
nine more slow, doomed browser launches on a blocked run. AutoTrader + Clutch
carry the listing count; CarGurus stays a bonus if it ever runs unblocked.

**External rendering service (optional).** Set `RENDER_SERVICE_URL` (see
`server/.env.example`) to a headless-browser/rendering API (ScrapingBee,
Browserless, ScraperAPI, …) and the JS fallback runs through it — so the JS
dealer sites, the OEM new-car pages and AutoTrader can be rendered from a host
without a local Chromium (Render). Falls back to a local Playwright browser when
no service is set.

The HTML sources run three extraction strategies per page (JSON-LD → embedded
state blobs → DOM cards) and keep the strategy with the most **usable** records
(a record needs both a year and a price — this is what stops year-less
AutoTrader JSON-LD from shadowing the DOM cards that do carry the year). A real
browser (Playwright) is used only when the static pass finds nothing **and**
`SCRAPE_JS_FALLBACK=1`. A failing source is logged and skipped — one bad site
never sinks a run.

Run `npm run scrape:check -w server` any time to confirm the extract → normalize
→ score → store pipeline is healthy independent of the network; the same check
is served at `GET /api/scrape/selfcheck`.

- **`POST /api/scrape`** starts a run (`409` while running or during the
  **10-minute cooldown**; `lastScrapeTime` comes from `ScrapeHistory`).
- **`GET /api/scrape/status`** streams progress + live logs (the UI's
  *Refresh Listings* button polls this, shows a progress bar and log panel,
  and disables itself until the cooldown expires).
- **Duplicate detection**: VIN when present, otherwise
  `year + make + model + trim + price + dealer`.

To add a dealership, append an entry to `server/src/config/dealers.json` —
no code changes required.

## Scoring (100 points, fully explainable)

| Category                | Pts | Based on                                             |
| ----------------------- | --- | ---------------------------------------------------- |
| Reliability             | 20  | CR/RepairPal-style data, engine & transmission       |
| Market Value            | 20  | Listing price vs market (live comparables ≥3, else model baseline) |
| Total Ownership Cost    | 15  | Fuel, insurance, maintenance, repairs, parts         |
| Winter Capability       | 10  | AWD, ground clearance, winter reliability, traction  |
| Safety                  | 10  | IIHS/NHTSA + driver-assist features on the car       |
| Mileage                 | 10  | Actual vs expected km for its age (not just lowest)  |
| Resale Value            | 5   | Brand/model value retention                          |
| Recalls & Known Issues  | 5   | Open-recall risk, costly pattern failures            |
| CPO / Warranty          | 3   | CPO status, remaining warranty                       |
| Desirable Features      | 2   | Heated seats, remote start, CarPlay/AA, ACC, sunroof |

Every listing exposes the full breakdown (points, stars, human-readable
reason per category), market comparison (market vs asking vs savings), deal
rating, known issues, pros and cons — the UI shows *why* a car ranks first.

Two things are deliberately **not** folded into the score:

- **Recall history** comes from Transport Canada data
  (`data/recalls.generated.json`, rebuilt with `npm run recalls:build -w server`)
  and is shown as its own labelled section. A recall on record means one was
  *issued* for that make/model/year — only the manufacturer can say whether a
  specific VIN still has it outstanding, so treating "12 recalls" as "12 open
  recalls" would misinform the buyer. It never penalises the Recalls score.
- **Insurance** in the ownership estimate is province-aware (a provincial
  market-average base, with the per-model risk tier layered on top), and the
  monthly-payment estimate uses the listing's provincial tax — neither is a
  single flat national number.

## API

| Endpoint                 | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `GET /api/listings`      | Filtered + sorted leaderboard. Filters: price, year, mileage, brand, model, province, city, drivetrain, fuel, CPO-only, dealer-only, source, score range. Sorts: score, deal, mileage, price, reliability, newest, resale. `page` / `pageSize` are integer-clamped (pageSize ≤ 100); `?keys=a,b,c` fetches specific listings by dedupe key (≤ 200) — how Favourites loads. Cached `max-age=30, stale-while-revalidate=300`. |
| `GET /api/listings/stats`| Inventory-wide aggregates for the header.            |
| `GET /api/listings/:id`  | Full detail: breakdown, ownership estimate, known issues, alternatives, external links (AutoTrader, CarGurus, CARFAX when VIN known). |
| `POST /api/scrape`       | Run the crawler (10-min cooldown, 8-min hard run budget). The run is claimed synchronously, so two concurrent POSTs can't both start a crawl. |
| `GET /api/scrape/status` | Progress, live logs, cooldown state.                 |
| `GET /api/scrape/history`| Past runs.                                            |
| `GET /api/scrape/selfcheck`| Pipeline health check (extract→normalize→score).   |
| `GET /api/meta`          | Filter options + sort keys for the UI.               |
| `GET /healthz`           | Liveness only — never touches storage. Used by Render and the keep-warm workflow. |
| `GET /api/health`        | Readiness: pings storage, `503` if it's unreachable. |
| `GET /api/newcars`       | Current-model lineup scraped from official OEM sites — Hyundai (browser-free) + Toyota/Honda/Mazda/Subaru (needs the Playwright fallback; see the Chromium note above). Cached 6h; `?refresh=1` forces a re-fetch. |

**Hardening.** Reads are rate-limited to 240/min per client and `POST
/api/scrape` to 20/min on top of its cooldown (it stays unauthenticated — the
Refresh button depends on it). Route errors go through one `asyncHandler` to a
global handler that returns a masked 500 and logs the real error under a request
id; every request gets an `x-request-id` and a JSON access-log line. `SIGTERM`
(sent by Render on each deploy) stops new connections and drains in-flight
ones. A crashed scrape marks its history row `failed` rather than leaving it
`running` forever, and on MongoDB `upsertListings` is a single `bulkWrite`.

## Deployment

- **Client**: static build (`client/dist`) — `vercel.json` is configured for
  Vercel (with an SPA rewrite that leaves `/api/*` alone). Set `VITE_API_URL`
  at build time to your API origin. Vercel redeploys on every push to `master`.
- **Server**: any Node host (Render, Railway, Fly.io). Set `MONGODB_URI`
  (MongoDB Atlas works) and optionally `PORT`. The crawler honors
  `HTTPS_PROXY` for hosts with egress proxies.

  **Render specifically**: `render.yaml` is only read when the service is
  *first* created from a Blueprint — later commits to it do **not**
  auto-update an already-existing service's dashboard settings. This
  particularly matters now: `render.yaml` deploys the API via the **Docker**
  runtime (`./Dockerfile`) instead of Render's native Node runtime, so a
  real, launchable Chromium is available for the browser-fallback paths (see
  the Chromium note above). Render does not convert an existing service's
  runtime type in place — a service created before this change needs to be
  **deleted and recreated from the Blueprint** (New → Blueprint → this repo)
  for the Docker runtime to take effect; a same-named service should get the
  same `*.onrender.com` URL back, but confirm it after. `MONGODB_URI` is
  deliberately `sync: false` (not stored in the YAML) and will need to be
  re-entered in the new service's Environment tab.

### Keeping the free-tier API awake

Render's free tier sleeps an idle instance, and waking it takes 30–60 s.
`.github/workflows/keep-warm.yml` pings `/healthz` on a timer to avoid that. It
holds its runner and pings every few minutes for most of an hour per run,
because GitHub throttles high-frequency cron triggers — measured over the first
85 runs, the median gap between runs that actually fired was ~103 minutes, and
none came in under Render's ~15-minute idle window, so a single ping per trigger
never helped. It never fails the run on a non-200 (that would train everyone to
ignore a red cron), and it's guarded to the upstream repo so forks don't wake
someone else's API. It remains a workaround for the hosting tier: a plan that
doesn't sleep, or an external pinger that honours a 5-minute schedule, is the
real fix.

### CI

`.github/workflows/ci.yml` runs server typecheck + tests and the server and
client builds on every push and PR to `master`; CodeQL runs alongside it.

## Further reading

- [`docs/SCALING-AND-SCRAPING.md`](docs/SCALING-AND-SCRAPING.md) — what it takes
  to go national, and why in-house anti-bot evasion isn't the answer (the IP is
  the layer that matters).
- [`docs/plans/2026-10-03-3d-interactive-upgrade.md`](docs/plans/2026-10-03-3d-interactive-upgrade.md)
  — the 3D score ring / pointer-effects / API-hardening plan.

## Workspace layout

```
client/            Vite + React 18 + TS + Tailwind v4 + React Query + Router
  src/pages/         Leaderboard, Detail, Compare, Favourites, New cars, Guide
  src/components/    cards, filters, ScoreRing3D, CompareTray, PaymentEstimate, …
  src/hooks/         useFavorites, useCompare, usePointerLight, useDebouncedCommit
  src/lib/           finance (loan + provincial tax), whyLine
  e2e/               Playwright UI tests
server/            Express + TS
  src/scoring/       the 100-point engine
  src/scrapers/      one module per source + shared extract/normalize/crawl
  src/newcars/       OEM new-car lineup
  src/services/      listings, scraping, recalls, self-check
  src/db/            Mongoose + file-store drivers, key migration
  src/data/          model knowledge base, recalls, EVAP eligibility
  src/scripts/       scrape:check, snapshot, seed, dealer probe, recall build
  src/tests/         120 node:test unit + pipeline tests
docs/              scaling/scraping assessment, plans
Dockerfile         Render image (Node + Chromium for the browser fallback)
render.yaml        Render Blueprint (Docker runtime)
```
