# CarScore V2

A production-quality web app for **first-time Canadian car buyers**: it collects
used-car listings from multiple websites, evaluates every vehicle with a hybrid
**100-point scoring engine**, and ranks the best-value cars — prioritizing
**reliability, value for money, winter driving and ownership cost** instead of
just the cheapest price.

```
React (TypeScript, Tailwind, React Query, React Router)
        ↓  REST API
Node (Express)
        ↓
Crawler service (Crawlee + Cheerio, Playwright fallback only)
        ↓
MongoDB (Mongoose) — or a built-in file store for zero-config dev
```

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
npm test -w server        # unit + pipeline test suite (no network needed)
npm run test:e2e          # Playwright e2e UI tests (boots API + client itself)
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

> **The two anchor sources are browser-free.** `AutoTrader.ca` (Ontario, paged
> via its embedded `__NEXT_DATA__` JSON) and `Clutch.ca` (a combined API query
> across every supported model) together return **1,000+ listings per run**
> with **no browser required** — they work on Render and other hosts without
> Chromium.
>
> **Some sites need a browser.** A couple of JS dealer sites block a plain
> server-side fetch outright, and a small number of Clutch model queries
> occasionally get WAF-challenged. `render.yaml`'s build command installs
> Chromium (`--with-deps`, so the shared libraries it needs to actually
> *launch* are included, not just the binary — see the comment in that file)
> so this works on Render too, no local setup needed. It's best-effort by
> design: if the install fails or the free-tier instance can't spare the
> memory to launch Chromium alongside the Node process, every
> browser-dependent path no-ops cleanly and the rest of the scrape is
> unaffected. Locally, `npm run setup` installs Chromium for you.
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
> (3 min) and each source at `SCRAPE_SOURCE_TIMEOUT_MS` (90 s — CarGurus's
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
  autotrader.ts    # AutoTrader.ca search pages per model (best-effort HTML)
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

**AutoTrader** (`autotrader.ts`) is the largest source (1,000+ Ontario listings
per run) and is fully browser-free. AutoTrader.ca is a Next.js app (AutoScout24
backend) whose server-rendered HTML embeds a clean, fully-structured
`"listings":[…]` array inside `__NEXT_DATA__` — real year/price/km/trim/fuel/
transmission plus the listing's true province and city, and a working VDP url.
Two things make this scale, both verified live: pagination works browser-free
via `&page=N` (each page is a genuinely different set of listings — the older
`rcs=` param does *not* paginate, which is why the previous tile-based
approach was stuck at ~20 listings per model regardless of requested page
size), and dropping the `prx=-1` "national" param filters results to Ontario
server-side. `AUTOTRADER_PAGES_PER_MODEL` (default 6) controls how many pages
per model to fetch; fetching is two-phase — page 1 of every model first, then
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

## API

| Endpoint                 | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `GET /api/listings`      | Filtered + sorted leaderboard. Filters: price, year, mileage, brand, model, province, city, drivetrain, fuel, CPO-only, dealer-only, source, score range. Sorts: score, deal, mileage, price, reliability, newest, resale. |
| `GET /api/listings/:id`  | Full detail: breakdown, ownership estimate, known issues, alternatives, external links (AutoTrader, CarGurus, CARFAX when VIN known). |
| `POST /api/scrape`       | Run the crawler (10-min cooldown, ≤3-min hard budget). |
| `GET /api/scrape/status` | Progress, live logs, cooldown state.                 |
| `GET /api/scrape/history`| Past runs.                                            |
| `GET /api/scrape/selfcheck`| Pipeline health check (extract→normalize→score).   |
| `GET /api/meta`          | Filter options + sort keys for the UI.               |
| `GET /api/newcars`       | Current-model lineup scraped from official OEM sites — Hyundai (browser-free) + Toyota/Honda/Mazda/Subaru (needs the Playwright fallback; see the Chromium note above). Cached 6h; `?refresh=1` forces a re-fetch. |

## Deployment

- **Client**: static build (`client/dist`) — `vercel.json` is configured for
  Vercel. Set `VITE_API_URL` at build time to your API origin.
- **Server**: any Node host (Render, Railway, Fly.io). Set `MONGODB_URI`
  (MongoDB Atlas works) and optionally `PORT`. The crawler honors
  `HTTPS_PROXY` for hosts with egress proxies.

  **Render specifically**: `render.yaml` is only read when the service is
  *first* created from a Blueprint — later commits to it do **not**
  auto-update an already-existing service's dashboard settings. If your
  service predates a `render.yaml` change (e.g. the Chromium build command
  above), open the service in the Render dashboard and manually update
  **Settings → Build Command** and **Environment** to match, or delete and
  recreate the service from the Blueprint.

## Workspace layout

```
client/   Vite + React 18 + TS + Tailwind v4 + React Query + Router
server/   Express + TS; scoring engine, scrapers, Mongoose models
```
