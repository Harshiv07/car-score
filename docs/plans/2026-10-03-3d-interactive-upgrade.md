# 3D / interactive / anti-slop upgrade + backend audit

Sources: the saved @codvyn reel (Three.js showcase sites, an "anti-slop" frontend skill, 21st.dev components,
"screenshot what you like and hand it to Claude"), the `frontend-design` skill, and the `backend-design:audit` skill.
The reel names its four sites only on screen and DMs the links, so this plan uses the techniques it points at rather
than copying any one site.

## Frontend

### Design direction (kept, not replaced)
"Boreal & gold" already is a considered identity: deep green-black base, gold reserved for score + primary action,
Bricolage Grotesque display. Anti-slop here means *not* swapping it for a stock 3D-blob hero. The 3D must carry data.

| Token | Value | Job |
|---|---|---|
| bg `#0a1410` / surface `#10201a` | boreal base | unchanged |
| brand `#e8b93f` | gold | the score, the primary action, the 3D ring's lit segments |
| good `#56d9a0` / warn `#f0a83c` / bad `#ff7b6b` | semantic | segment colour by category strength |

### Changes
1. **ScoreRing3D** (new, `three`, lazy-loaded): the top pick's 10 scoring categories as 10 extruded arc segments of a ring.
   Segment *height* = points/max, colour = strength. Drag/pointer rotates it with inertia; hovering a segment names the
   category and its points. This replaces nothing decorative: it is the score breakdown, in 3D.
   - Falls back to the existing static `<dl>` when `prefers-reduced-motion`, no WebGL, or coarse-pointer low-power.
   - Disposes geometry/renderer on unmount; pauses when off-screen (IntersectionObserver) and tab hidden.
   - Dynamic `import()` so three.js never lands in the main bundle.
2. **Pointer light + tilt** (new `usePointerLight`, CSS only, no library): the hero leans ~2° toward the cursor and every
   listing card gets a gold spotlight that follows it. Written straight to CSS variables (no React re-render), one write
   per frame; fine pointers only; tilt off under reduced motion. Cards get the spotlight but *not* tilt: their
   framer-motion hover already owns `transform`, and tilting a long list is more noise than signal.
3. **Detail page**: the same ring above the numeric bars, which stay as the exact figures and the reasons.
4. **GSAP** drives the one orchestrated moment: the ring turns in and its arcs rise in sequence, so the total visibly
   assembles from its parts. (framer-motion can't animate Three.js objects.)
   Also done: the hero no longer fades up separately (the ring is its one moment) and its "Top pick" / score-band
   labels are sentence case instead of tracked all-caps.

### Quality floor
Keyboard-focusable ring with an accessible text equivalent, visible focus, mobile 375px, light theme legible.
Verify with the built-in browser: screenshots at desktop + mobile, dark + light, console clean.

## Backend (audit findings → fixes)

Audited: `index.ts`, `routes/*`, `services/scrapeService.ts`, `services/listingService.ts`, `db/mongoStorage.ts`.

| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | **Race**: `startScrape` awaits `cooldownRemainingMs()` *before* setting `state.running`, so two concurrent POSTs both start a crawl | `scrapeService.ts:79-96` | claim the run synchronously before any await |
| 2 | **Error leak**: every route returns `(e as Error).message` on 500, defeating the global masked handler (driver/Mongo text reaches clients) | `routes/*.ts` | one `asyncHandler`; routes throw, global handler logs + masks |
| 3 | **N+1 writes**: `upsertListings` does `findOne` + `updateOne`/`create` per listing, sequentially (1,000+ round trips per crawl on Atlas) | `mongoStorage.ts:175-196` | single `bulkWrite` with `$set` / `$setOnInsert`, same inserted/updated counts |
| 4 | **Stuck "running" history**: if `runScrape` throws mid-run the history row stays `running` forever | `scrapeService.ts:134-207` | `try/finally` marks the entry `failed`/`completed` |
| 5 | **Fake healthcheck**: `/api/health` returns ok without touching the DB | `index.ts:97` | `/healthz` stays liveness; `/api/health` pings storage (503 if down) |
| 6 | **Unvalidated paging**: `page=1.5`, `pageSize=abc` flow into `slice` | `routes/listings.ts:90-92` | integer-clamp helpers |
| 7 | **O(n·k) key filter, O(n) id lookup** per request | `routes/listings.ts:84,126` | `Set` for keys; id→listing Map built with the score cache |
| 8 | **No request id / access log**; failures can't be correlated | `index.ts` | tiny middleware: `x-request-id`, one JSON line per request with duration |
| 9 | **No graceful shutdown** on Render SIGTERM | `index.ts:143` | close server, disconnect mongoose, hard-exit timer |

Deliberately *not* changed: `POST /api/scrape` stays unauthenticated (the Refresh button is a public feature; it is
rate-limited and cooldown-gated). Flagged as a risk, not a fix. No new infrastructure — all fixes are in-process.

## Verification
`npm test -w server` (add tests for #1, #3 counts parity, #6), `npm run typecheck`, `npm run build`, then drive the app
in the browser for the visual pass.
