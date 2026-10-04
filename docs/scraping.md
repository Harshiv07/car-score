# Scraping

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
