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
npm run setup        # npm install + downloads Chromium for the browser fallback
npm run dev          # API on :4000, app on :3000 (proxied /api)
npm test -w server   # scrape-pipeline test suite (no network needed)
```

No database needed for development — without `MONGODB_URI` the server uses a
JSON-file store (`server/.data/db.json`) seeded with representative listings.

> **Why Chromium matters:** the Thunder Bay dealer sites (Wayne Toyota, Gore
> Motors Honda, Half-Way Motors Mazda, Superior Hyundai) render their
> inventory client-side, so the static Cheerio pass finds nothing on them by
> design — they are only scrapeable through the Playwright browser fallback.
> If a scrape log says "Browser fallback disabled: Chromium is not
> installed", run `npx playwright install chromium` and scrape again.

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
  autotrader.ts    # AutoTrader.ca search pages per model
  cargurus.ts      # CarGurus.ca (best-effort — DataDome anti-bot)
  clutch.ts        # Clutch.ca (__NEXT_DATA__ blob)
  dealer.ts        # dealership sites, configurable via src/config/dealers.json
```

Extraction runs three strategies per page (JSON-LD → embedded state blobs →
DOM cards) and falls back to a real browser (Playwright) only when the static
pass finds nothing on a JS-rendered site. A failing source is logged and
skipped — one bad site never sinks a run.

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
| `POST /api/scrape`       | Run the crawler (10-min cooldown).                   |
| `GET /api/scrape/status` | Progress, live logs, cooldown state.                 |
| `GET /api/scrape/history`| Past runs.                                           |
| `GET /api/meta`          | Filter options + sort keys for the UI.               |

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
