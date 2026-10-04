# API

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
