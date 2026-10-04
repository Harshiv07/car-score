# Architecture and features

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

### What's in the app

| Page | What it does |
| ---- | ------------ |
| **Leaderboard** (`/`) | Ranked listings with filters, 7 sort modes and pagination, led by a **Top Pick** studio stage: the best car for the current query on a lazy-loaded 3D turntable (Three.js, sedan or SUV to match the pick), next to the real listing photo and its scorecard. Every row gives a one-line *why* built only from what the engine scored, and a **composition strip** — ten segments, each as wide as the points its category is worth, filled as far as the car earned, red below half. |
| **Listing detail** (`/listing/:id`) | Full 100-point breakdown, market comparison, ownership and **monthly payment** estimate (province-aware tax, rate and term), Transport Canada **recall history**, known issues, pros/cons, alternatives and links to the seller. |
| **Compare** (`/compare`) | Up to three cars side by side, category by category. The comparison set lives in `sessionStorage` — it's a decision you're making now. |
| **Favourites** (`/favorites`) | Cars you've hearted, saved in this browser (`localStorage`, synced across tabs). |
| **New cars** (`/new-cars`) | Current-model lineup scraped from official OEM sites. |
| **Guide** (`/guide`) | A first-car buyer's guide: what it really costs, who is selling it, the three meanings of "certified", the walkaround (a 3D car that turns to face each of seven inspection points, with a flat SVG fallback), tyres, rust, test drive, paperwork, inspection, negotiating, when to walk away. |

Electric listings get an **EVAP-eligible** badge on cards and the detail page (federal
EV Affordability Program, BEV/FCEV tier only — see `data/evapEligibility.ts` for what it
does and doesn't claim). Also: daylight/night theme (follows the system until you pick one), a **Refresh Listings** control with live scrape
logs and a cooldown timer, and a cold-start notice — the API sleeps on Render's
free tier, so returning visitors repaint instantly from cached results and
first-timers are told why the first load is slow instead of staring at a spinner.

### Supported models

Only these are scraped and scored:

| Brand   | Models              |
| ------- | ------------------- |
| Toyota  | Corolla, RAV4       |
| Honda   | Civic, CR-V         |
| Mazda   | Mazda3, CX-5        |
| Hyundai | Elantra, Tucson     |
| Subaru  | Forester, Crosstrek |

### Workspace layout

```
client/            Vite + React 18 + TS + Tailwind v4 + React Query + Router
  src/pages/         Leaderboard, Detail, Compare, Favourites, New cars, Guide
  src/components/    ListingRow, ScoreStrip, TopPickStage, Stage, filters, CompareTray, PaymentEstimate, …
  src/three/         procedural studio car (carModel) and the stage that renders it (CarStage), lazy-loaded
  src/hooks/         useFavorites, useCompare, usePresence, useDebouncedCommit
  src/lib/           finance (loan + provincial tax), whyLine, motion (GSAP setup)
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

### Design system

"Winter daylight": frost background, asphalt-blue ink, and hi-vis plough orange
reserved for actions and the number-one car. Score bands have their own scale
(spruce ≥80, lake 65–79, amber 50–64, brake red <50). One typeface, Archivo,
used across its width axis — wide and heavy for headlines, scores and prices,
normal for reading. Tokens live in `client/src/index.css`; night mode swaps the
same roles under `.dark`.

Motion is GSAP: one entrance per page per visit (headline lines rising out of a
mask, the hero car rolling on, the score counting up and its strip filling),
and otherwise only motion that answers an action — the walkaround car turning
to a chosen point, drawers and the compare tray sliding in. Everything respects
`prefers-reduced-motion`. three.js and the GSAP scroll plugin stay out of the
main bundle.
