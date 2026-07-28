# Scaling CarScore: dealer coverage, scraping tools, and anti-bot

An assessment of what it takes to go from 4 sources and ~1,200 listings to
national coverage, and a straight answer on whether to build anti-bot evasion
in-house.

---

## 1. The finding that should drive strategy

The repo already ran the experiment most teams skip. Commit `305e9117` tested,
live, against CarGurus' DataDome protection:

- plain Playwright,
- Crawlee's `PlaywrightCrawler` with `fingerprint-injector` (navigator/WebGL/device spoofing),
- `playwright-extra` + `puppeteer-extra-plugin-stealth`.

**All three returned an identical DataDome 403.** The conclusion recorded there
is correct and worth repeating, because it invalidates most of the advice on
the open internet:

> None of these techniques change the one thing that actually matters — the IP
> the request comes from.

Modern anti-bot stacks score four layers independently:

| Layer | What's checked | Fixable in code? |
| --- | --- | --- |
| Network | IP ASN + reputation (datacenter vs residential), rate, history | **No** — it's an infrastructure purchase |
| TLS | JA3/JA4 handshake fingerprint vs claimed User-Agent | Yes (`curl_cffi`, `tls-client`) |
| Browser | `navigator.webdriver`, CDP artifacts, WebGL/canvas/font entropy | Partly (Camoufox, nodriver, Patchright) |
| Behaviour | Mouse/scroll/timing, session age, request graph | Partly, expensively |

Fixing layers 2–4 while failing layer 1 gets you a 403 that looks exactly like
the one you started with. That's precisely what the commit observed. **Any plan
that starts with "let's write better stealth code" is starting at the wrong
layer.**

---

## 2. The real scaling insight: dealers are a platform oligopoly

This is the most valuable structural fact for CarScore, and `dealers.json`
already half-encodes it. Individual dealership websites are almost never
bespoke. They're white-label builds from a small number of vendors:

**Canada:** Convertus (TRADER-owned), EDealer (1,700+ clients), SM360,
Strathcom, Dealer.com (Cox), DealerOn, plus WordPress themes like Motors.
**US adds:** Dealer Inspire, DealerSocket/Cars.com, Sincro, Fox Dealer.

The consequence: **you do not write 3,000 scrapers, you write ~12 adapters.**
The existing code already proves the model works — `convertus.ts` handles two
dealers off one Convertus VMS JSON endpoint keyed by a `cp` company id;
`edealer.ts` reads a `vehicleArray` blob; `stmMotors.ts` walks a sitemap.

So the scaling unit is *platform adapter*, and onboarding a dealer becomes a
config row, not an engineering ticket. Two things make this compound:

1. **Platform fingerprinting.** Given a dealer URL, detect the platform
   automatically (markup signatures, asset hosts, `/ajax-vehicles.php`-style
   endpoints, sitemap shape) and auto-assign the adapter. Onboarding drops to
   pasting a domain.
2. **Prefer the data endpoint, not the page.** Every one of these platforms
   feeds its own front-end JSON. Convertus already does. That's how the current
   scraper reaches 800+ listings browser-free — no Chromium, no fingerprint
   surface, ~100× cheaper. Keep that discipline: **HTML parsing is the fallback,
   not the default.**

Critically, dealer sites are also the *soft* target. They largely don't run
DataDome or Cloudflare Bot Management — that's an aggregator (AutoTrader,
CarGurus) problem. **National dealer coverage is achievable without solving
anti-bot at all.** That should be the next 6 months of roadmap.

---

## 3. Tooling, tiered by what you actually need

Use the cheapest tier that works, and only escalate on failure. Roughly 80% of
dealer inventory needs tier 1.

### Tier 1 — no browser (default; what you already do)
- **Crawlee + Cheerio** (current stack) — keep it.
- **`curl_cffi`** (Python) — HTTP client that impersonates real browser TLS/JA3
  handshakes. Defeats TLS-layer checks at roughly the cost of a plain request.
  This is the single highest-leverage addition available, and the reason to
  care that Python 3.14 is now on this machine.
- **Scrapy** — mature scheduling/retry/pipeline framework if the Python side
  grows. No JS execution, so pair it with tier 2 for hydrated sites.

### Tier 2 — real browser, only when the data doesn't exist without JS
- **Patchright** — drop-in patched Playwright; removes the CDP `Runtime.enable`
  leak that stock Playwright emits. Lowest-friction upgrade from your code.
- **Camoufox** — Firefox patched at the C++ level so fingerprint spoofing isn't
  observable from JS. Currently the strongest open-source option.
- **nodriver** — CDP-direct, no WebDriver footprint.

Note `puppeteer-extra-plugin-stealth` is effectively obsolete against current
Cloudflare/DataDome — consistent with what you measured.

### Tier 3 — buy the network (the part you cannot code)
- **Residential/mobile proxies**: Bright Data, Oxylabs, Decodo, IPRoyal.
  ~$3–8/GB residential. This is the layer that actually moves the needle.
- **Full unblocker APIs**: Scrapfly, ZenRows, Bright Data Web Unlocker,
  ScrapingBee. You send a URL, they return HTML and absorb the arms race.
  ~$1–5 per 1,000 requests.

### Tier 0 — the option worth pricing before any of the above
**Licensed data.** AutoTrader/TRADER, Cars.com, MarketCheck, DataOne, Edmunds
and vAuto all sell listing feeds. For market-value comparables — which is what
CarGurus was for — a licensed feed is often *cheaper than proxies*, arrives
clean, and carries zero legal or reliability risk. Get a quote before investing
engineering months in evasion.

---

## 4. Should you build anti-bot bypass in-house?

**Technically feasible in part; strategically a poor use of a small team. My
recommendation: no — buy the network layer, build the platform adapters.**

What you *can* realistically build:
- TLS impersonation — solved by adopting `curl_cffi`. Days.
- Fingerprint hardening — solved by adopting Camoufox/Patchright. Days.

What you *cannot* realistically build:
- **A residential IP pool.** This is the binding constraint you already
  measured. Acquiring one legitimately means commercial ISP relationships;
  acquiring one cheaply means SDK-bundled consumer devices, which is an ethical
  and legal minefield. There is no clever code path around this.
- **Sustained CAPTCHA/behavioural defeat.** DataDome and Cloudflare ship model
  updates continuously. A self-maintained bypass is not a feature you build
  once; it is a permanent headcount cost, and it breaks at 3am without warning.

The honest economics: a vendor charging ~$2/1k requests is amortising that arms
race across thousands of customers. You cannot match that unit cost with one
engineer, and every hour spent there is an hour not spent on the scoring engine
— which is the part competitors can't copy.

**Where the effort should go instead:** platform adapters (§2). They're
durable, they're not adversarial, and they're the actual moat.

### Legal and operational guardrails

Not legal advice — but the shape of the risk matters to the roadmap:

- Scraping public data is broadly defensible in the US after *hiQ v. LinkedIn*,
  and Canada has no CFAA analogue; but **ToS breach, database rights, and
  copyright in photos/descriptions are separate exposures**, and circumventing
  an access control is legally distinct from reading a public page.
- Republishing dealer photos at scale is a copyright question. Hotlinking (what
  you do now) is materially safer than rehosting.
- Practical hygiene that also reduces block rate: honour `robots.txt` for
  crawl-delay, identify the bot honestly in User-Agent with a contact URL,
  cap concurrency per domain, cache aggressively, and back off on 429/503.
  Many dealers will happily whitelist an aggregator that sends them leads —
  **ask before you evade**. A dealer-facing "get listed free" page converts an
  adversarial problem into an inbound one.

---

## 5. Engineering bottlenecks between here and 50,000 listings

Beyond acquisition, three things in the current codebase break at scale.

**a) Scoring was O(n²) per request — fixed in this branch.**
`getScoredListings()` re-scored the entire inventory on *every* API call because
Market Value compares each listing against all current comparables. Measured at
1,189 listings: ~120ms of pure CPU per request, including single-listing detail
views. Now fingerprinted and cached, invalidated when a scrape writes:
**120ms → 4ms**. But the underlying algorithm is still quadratic. At 50k
listings a cold recompute is minutes, not milliseconds. Next step: bucket
comparables by `make|model|year±1` so scoring is O(n·k), and move it to a
post-scrape batch job that writes scores to the DB rather than a read-path
computation.

**b) Storage.** The JSON file store is a dev convenience and loads the entire
inventory into memory per call. At scale, Mongo needs compound indexes on
`(make, model, year)`, `(price)`, `(score.total)`, `dedupeKey` unique, and
listings should be pre-scored at write time so `/api/listings` is a paginated
indexed query rather than a full scan.

**c) Crawl orchestration.** A single in-process run under a wall-clock budget
doesn't survive hundreds of sources. That wants a queue (BullMQ/Redis) with
per-domain rate limiting, per-source scheduling, and independent retries, so one
slow dealer can't consume the run budget — the exact failure the current
`SCRAPE_RUN_BUDGET_MS` cap exists to contain.

**d) Deduplication.** VIN-first is right. Push harder on VIN capture — the same
car listed by a dealer *and* syndicated to AutoTrader is currently two rows
unless both expose a VIN, which inflates counts and skews the comparable set
that Market Value depends on.

---

## 6. Recommended sequence

| Phase | Work | Why |
| --- | --- | --- |
| **1 (now)** | Platform fingerprinter + adapters for Convertus, EDealer, SM360, Strathcom, Dealer.com. Dealer onboarding = paste a URL. | Highest coverage per unit effort; no anti-bot involved |
| **2** | Adopt `curl_cffi` for HTTP; Patchright/Camoufox for the JS-only minority | Cheap, removes two whole detection layers |
| **3** | Move scoring to a write-time batch job with bucketed comparables; Mongo indexes; BullMQ crawl queue | Unblocks 50k+ listings |
| **4** | Price licensed comparables data (MarketCheck et al.) against a proxy budget | Likely cheaper *and* lower risk than beating DataDome |
| **5** | Only if 4 fails: buy an unblocker API for aggregators. Do not build it. | Rented arms race beats an owned one |

**The one-line version:** the moat is the scoring engine and the platform
adapter library, not the ability to defeat DataDome. Buy that layer if you ever
truly need it, and spend the engineering on coverage and correctness.

---

## Sources

- [11 Best Anti-Bot Bypass Tools for Web Scraping in 2026 — Scrapfly](https://scrapfly.io/blog/posts/best-anti-bot-bypass-tools)
- [How to Bypass DataDome Anti-Scraping in 2026 — Scrapfly](https://scrapfly.io/blog/posts/how-to-bypass-datadome-anti-scraping)
- [How to Bypass Cloudflare when Scraping — ZenRows](https://www.zenrows.com/blog/bypass-cloudflare)
- [Bypass Cloudflare & DataDome: TLS Fingerprints — apiserpent](https://apiserpent.com/blog/bypass-cloudflare-datadome-scraping)
- [2026 List of Dealer CMS Providers — DealerRefresh](https://forum.dealerrefresh.com/threads/2026-list-of-dealer-cms-providers.11568/)
- [EDealer — Automotive Marketing Solutions](https://www.edealer.ca/)
- [Convertus Digital — Dealership Website Solutions](https://www.convertus.com/solutions/primary-website-solutions/)
- [Best Dealership Website Platforms in 2026 — VendorMotive](https://www.vendormotive.com/insights/best-dealership-website-platforms-2026)
