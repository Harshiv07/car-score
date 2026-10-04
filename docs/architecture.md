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
