# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
First-time car buyers in Canada on a tight budget who do not yet know what to trust. They research at home, then use the product on a phone at a dealer or private-sale lot to decide whether to look at a car, ask about it, or walk away. Anyone shopping used cars in Canada can use it, but decisions are made for the first-timer.

## Product Purpose
CarScore scrapes used-car listings (AutoTrader, Clutch, CarGurus where reachable, and local dealers) and scores each car out of 100 on reliability, real market value against comparable listings, winter capability and ownership cost. It ranks the best-value cars rather than the cheapest. It also lists the current new-car lineup with Canadian MSRPs, and a guide for buying a used car. Success is a first-time buyer finding a good car quickly and trusting why it ranks where it does.

## Positioning
It ranks the car, not the asking price: one 0-100 score the buyer can open up and read category by category, built for Canadian conditions (winter, provinces, CAD, Ontario-style ownership costs). Neighbouring listing sites sort by price and recency and do not explain a car's merit.

## Operating Context
- Mostly used on a phone, often standing at a car, one-handed, with poor attention to spare.
- Listings change daily; cars sell. The inventory refreshes by crawling sources, at most once every ten minutes, and removes cars a trusted source no longer shows.
- Saved cars and the comparison tray live in the visitor's browser (no accounts).
- New-car prices are a curated file with a visible "prices as of" date, not live scraping.

## Capabilities and Constraints
- Leaderboard of scored used cars with filters (price, mileage, drivetrain, make/model, year, source, certified, dealer), list and price-vs-mileage map views, pagination.
- Listing detail: score breakdown across categories, market comparison, ownership cost, recalls and known issues, finance estimate, similar cars.
- Compare up to three cars; Saved cars (keyed by VIN or URL so they survive refreshes); light and dark themes.
- New cars: five brands (Toyota, Honda, Mazda, Hyundai, Subaru), trims and Canadian MSRPs where confirmed, otherwise "See official site".
- Guide: a checklist for viewing a used car (budget, search, inspect, close), with a 3D walkaround of inspection points.
- Stack: React, Vite, Tailwind v4, GSAP, three.js (guide walkaround only); Express server; MongoDB or file store. Deployed on Vercel (client) and Render (API, free tier that sleeps).
- Terminology: "score" (0-100), four bands (excellent, good, fair, poor), "market value", "under market". The product is called CarScore.
- Undecided: the visual identity (a replacement visual world is being chosen) and the logo.

## Brand Commitments
- The name CarScore; production URL carscores.vercel.app.
- The 0-100 score, its category breakdown and four-band reading stay; their presentation may change.
- Saved cars, Compare and light/dark themes keep working with existing browser data.
- No invented prices, reviews, counts or savings. Unknown values stay unknown.
- Voice: plain, direct, sentence case, no hype. Fewer words and smaller titles are explicit owner preferences (the previous home page was judged too wordy and too loud).

## Evidence on Hand
- Real scraped listings with photos where sources provide them; a scoring engine with model knowledge for ten used models; recall data.
- A curated 24-model new-car file with sourced Canadian MSRPs (several models intentionally priceless where no trustworthy MSRP was found).
- Kenney Car Kit 3D models (CC0) for the guide walkaround.
- No testimonials, case studies, press or user counts exist. Do not fabricate any.

## Product Principles
1. Judge the car, not the price: the score leads, price is evidence inside it.
2. Show the work: every number can be opened to its reasons; what is unknown says so.
3. Built for the moment of decision: scannable in seconds on a phone, with few words.
4. Calm over clever: nothing on screen that does not help someone choose.
5. Canadian by default: winter, provinces, dollars and ownership costs are first-class.

## Accessibility & Inclusion
Meet WCAG 2.2 AA: contrast at least 4.5:1 for body text, visible keyboard focus, touch targets of at least 44px, never rely on colour alone to convey a score band, respect reduced-motion preferences, usable at 320px wide and with text scaling.
