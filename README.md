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
> **Some sites need a browser.** CarGurus (DataDome) and a couple of JS dealer
> sites block a plain server-side fetch outright, and a small number of Clutch
> model queries occasionally get WAF-challenged. `render.yaml`'s build command
> installs Chromium (`--with-deps`, so the shared libraries it needs to
> actually *launch* are included, not just the binary — see the comment in
> that file) so this works on Render too, no local setup needed. It's
> best-effort by design: if the install fails or the free-tier instance can't
> spare the memory to launch Chromium alongside the Node process, every
> browser-dependent path no-ops cleanly and the rest of the scrape is
> unaffected. Locally, `npm run setup` installs Chromium for you.
>
> **A run can never hang.** The whole run is capped at `SCRAPE_RUN_BUDGET_MS`
> (4 min) and each source at `SCRAPE_SOURCE_TIMEOUT_MS` (1 min); tune sources
> and page counts via env vars (see `server/.env.example`). These favor more
> data over raw speed — a scrape runs as a background job (the client polls
> `/api/scrape/status`, not a blocking request), so there's no reason to keep
> it artificially short; tighten them back down if you want the original
> fast/shallow behaviour. The API keeps serving listings while a scrape is in
> progress either way.

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
  cargurus.ts      # CarGurus.ca (best-effort — DataDome anti-bot)
  dealer.ts        # dealership sites, configurable via src/config/dealers.json
  config.ts        # env-driven run budget, timeouts, source allow-list
```

**Browser-free sources (work everywhere, incl. Render).** Each `dealers.json`
entry has a `platform`:
- **Clutch.ca** — public JSON API, queried per supported model (not per make —
  a make-level query only pulls the first few pages of a make's *whole*
  inventory, which silently starves low-volume models like Mazda CX-5 when
  the make sells a dozen other models too), in a rotating order (see below).
  A model that gets WAF-challenged gets one retry through a real browser
  session (page navigates to clutch.ca first, so the site's bot challenge
  resolves normally, then the same API call is made *from inside that page* —
  a bare server-side fetch can get blocked in a way an in-page fetch from a
  browser-cleared session doesn't). No-ops if no browser is available.
  Clutch's WAF reliably allows only the first few requests of a run through
  before throttling the rest, so a fixed query order would let the same 2-3
  models win every single run and permanently starve the other 7 — the query
  order rotates by a time bucket (`rotatedModelTargets`) so a different model
  is "first" each run, and every model accumulates real Clutch coverage over
  successive runs instead.
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

**AutoTrader** is scraped with a bespoke tile parser (`autotrader.ts`): each
result `<article>` links to a VDP and shows year/price/km as text, so the
parser pairs every VDP anchor with its own tile (the smallest ancestor holding
a price) using element-boundary-aware text. The static pages already carry the
tiles, so this works browser-free; the rendered fallback tops it up. Every
supported model gets its own request — this is anchored to `TARGETS`
directly, not sliced by `SCRAPE_MAX_PAGES` (that knob caps a *generic* dealer
scraper's page count; reusing it here once silently dropped 6 of the 10
supported models from ever being queried at all).

**Model matching** (`matchModelFromTitle` in `data/vehicleModels.ts`) uses
word-boundary-aware alias matching, not a plain substring check — a real
Mazda **CX-50** was being mismatched as our **CX-5** because `"cx-50"` simply
contains `"cx-5"` as a text prefix. A couple of same-nameplate-different-model
collisions (e.g. Toyota **Corolla Cross**, a different Toyota model/platform
from the Corolla we score) need an explicit exclusion since both spans are
genuinely word-bounded; see `FALSE_POSITIVE_FOLLOWERS`.

**CarGurus** (DataDome anti-bot) is best-effort — it uses the render fallback
when the static pass finds nothing, but DataDome blocks primarily on **IP
reputation** (known datacenter/hosting ranges get a 403 before any JS
challenge or browser fingerprint is even checked — confirmed live: a plain
`fetch()` and a full local Chromium session got the identical 403 from the
same IP). A local Chromium alone doesn't fix that; it needs a *residential*
IP, which is what the Apify rendering service below is configured for. It
never breaks a run either way — no listings from CarGurus is a normal,
handled outcome, not a failure.

**External rendering service: Apify (optional).** Set `APIFY_TOKEN` (see
`server/.env.example`) and the JS fallback runs through Apify's
`apify/web-scraper` actor — Apify runs the actual browser on its own
infrastructure, so CarGurus, the JS dealer sites, the OEM new-car pages and
AutoTrader can all be rendered from a host without a local Chromium (Render).
By default it also routes through Apify's **residential** proxy pool
(`APIFY_PROXY_GROUPS=RESIDENTIAL`), the specific lever for IP-reputation-based
blocks like CarGurus's. Falls back to a local Playwright browser when no
token is set.

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
