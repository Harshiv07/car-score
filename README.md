# CarScore

A web app for first-time Canadian car buyers. It scrapes used-car listings from AutoTrader, Clutch, CarGurus and local dealers, scores each vehicle out of 100 on reliability, value, winter capability and ownership cost, and ranks the best-value cars rather than the cheapest.

Stack: React + TypeScript + Tailwind (client), Express + Crawlee (server), MongoDB or a built-in file store.

## Run it

```bash
npm run setup   # install dependencies and Chromium
npm run dev     # API :4000, app :3000
npm test -w server
```

No database is needed locally.

## Docs

Everything else lives in [`docs/`](docs/README.md): architecture, getting started, scraping, scoring, API, deployment.
