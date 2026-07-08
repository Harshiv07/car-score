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
```

No database needed for development — without `MONGODB_URI` the server uses a
JSON-file store (`server/.data/db.json`) seeded with representative listings.

> **The primary source is browser-free.** `Clutch.ca` is scraped through its
> public JSON API, so it returns fully-structured, accurate listings (year,
> price, mileage, drivetrain, fuel) with **no browser required** — it works on
> Render and other hosts without Chromium.
>
> **Everything else is best-effort.** Most Canadian car sites (AutoTrader,
> CarGurus, the Thunder Bay dealers) render inventory client-side and/or block
> automated access from datacenter IPs (AWS WAF, DataDome, Cloudflare), so a
> static crawl from a server usually finds nothing on them. To render the JS
> dealer sites **locally**, install Chromium (`npx playwright install
> chromium`) and run with `SCRAPE_JS_FALLBACK=1`.
>
> **A run can never hang.** The whole run is capped at `SCRAPE_RUN_BUDGET_MS`
> (2 min) and each source at `SCRAPE_SOURCE_TIMEOUT_MS` (30 s); tune sources and
> page counts via env vars (see `server/.env.example`). The API keeps serving
> listings while a scrape is in progress.

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
  autotrader.ts    # AutoTrader.ca search pages per model (best-effort HTML)
  cargurus.ts      # CarGurus.ca (best-effort — DataDome anti-bot)
  dealer.ts        # dealership sites, configurable via src/config/dealers.json
  config.ts        # env-driven run budget, timeouts, source allow-list
```

**Browser-free sources (work everywhere, incl. Render).** Each `dealers.json`
entry has a `platform`:
- **Clutch.ca** — public JSON API.
- **`convertus`** (Wayne Toyota, Superior Hyundai) — the dealer site's own
  same-origin `convertus-vms/…/ajax-vehicles.php` proxy (set each dealer's `cp`
  company id).
- **`stm`** (Gore Motors) — the WordPress Motors theme publishes a
  `listings-sitemap.xml`; we read the per-vehicle pages it lists (slug carries
  year-make-model, page carries price + mileage).

All return complete, structured vehicles (year, price, km, VIN where available,
drivetrain, fuel).

**AutoTrader** is scraped with a bespoke tile parser (`autotrader.ts`): each
result `<article>` links to a VDP and shows year/price/km as text, so the
parser pairs every VDP anchor with its own tile (the smallest ancestor holding
a price) using element-boundary-aware text. The static pages already carry the
tiles, so this works browser-free; the rendered fallback tops it up.

**CarGurus** (DataDome anti-bot) remains best-effort — it blocks datacenter
IPs and headless browsers alike; a residential IP or stealth rendering service
sometimes passes. It never breaks a run.

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
| `POST /api/scrape`       | Run the crawler (10-min cooldown, ≤2-min hard budget). |
| `GET /api/scrape/status` | Progress, live logs, cooldown state.                 |
| `GET /api/scrape/history`| Past runs.                                            |
| `GET /api/scrape/selfcheck`| Pipeline health check (extract→normalize→score).   |
| `GET /api/meta`          | Filter options + sort keys for the UI.               |
| `GET /api/newcars`       | Current-model lineup scraped from official OEM sites — Hyundai (browser-free) + Toyota/Honda/Mazda/Subaru (Playwright, local only). Cached 6h; `?refresh=1` forces a re-fetch. |

## Deployment

- **Client**: static build (`client/dist`) — `vercel.json` is configured for
  Vercel. Set `VITE_API_URL` at build time to your API origin.
- **Server**: any Node host (Render, Railway, Fly.io). Set `MONGODB_URI`
  (MongoDB Atlas works) and optionally `PORT`. The crawler honors
  `HTTPS_PROXY` for hosts with egress proxies.

## Workspace layout

```
client/   Vite + React 18 + TS + Tailwind v4 + React Query + Router
server/   Express + TS; scoring engine, scrapers, Mongoose models
```
