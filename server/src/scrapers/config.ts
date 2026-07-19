/**
 * Central, env-driven scrape configuration.
 *
 * Every knob has a safe default so a scrape run can never hang — the run
 * always ends, one way or another, on its own. Since a scrape runs as a
 * background job (the client polls /api/scrape/status rather than blocking
 * on one long HTTP request), there's no request-timeout pressure to keep this
 * short: the defaults below trade a couple of minutes of extra time for
 * meaningfully more data per run (deeper pagination, room for the
 * Apify-based retries to actually complete their round trip). Tighten via the
 * environment (or `.env`) without touching code if you want the old fast/
 * shallow behaviour back — this is the mechanism the original task called
 * for: "reduce the number of sites or pages to confirm that it is able to
 * scrape data".
 *
 *   SCRAPE_RUN_BUDGET_MS    hard cap on the whole run (default 240000 = 4 min)
 *   SCRAPE_SOURCE_TIMEOUT_MS per-source cap (default 60000 = 1 min)
 *   SCRAPE_MAX_PAGES        max pages/URLs fetched per source (default 4)
 *   SCRAPE_SOURCES          comma list to include, e.g. "clutch,autotrader"
 *                           (default: all registered sources)
 *   SCRAPE_JS_FALLBACK      "1" to allow the Playwright browser fallback
 *                           (default off — it needs Chromium and is slow;
 *                            the API-based sources don't need it)
 *   SCRAPE_REQUEST_TIMEOUT_MS single HTTP request cap (default 12000)
 *   SCRAPE_CONCURRENCY      parallel requests per source (default 4)
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(name: string): string[] | null {
  const raw = process.env[name];
  if (!raw) return null;
  const items = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return items.length ? items : null;
}

export interface ScrapeConfig {
  runBudgetMs: number;
  sourceTimeoutMs: number;
  requestTimeoutMs: number;
  maxPagesPerSource: number;
  concurrency: number;
  jsFallbackEnabled: boolean;
  /** null = every registered source; otherwise only these keys. */
  enabledSourceKeys: string[] | null;
}

export function loadScrapeConfig(): ScrapeConfig {
  return {
    runBudgetMs: num("SCRAPE_RUN_BUDGET_MS", 240_000),
    sourceTimeoutMs: num("SCRAPE_SOURCE_TIMEOUT_MS", 60_000),
    requestTimeoutMs: num("SCRAPE_REQUEST_TIMEOUT_MS", 12_000),
    maxPagesPerSource: num("SCRAPE_MAX_PAGES", 4),
    concurrency: num("SCRAPE_CONCURRENCY", 4),
    // Default ON: locally `npm run setup` installs Chromium (the free
    // open-source headless browser Playwright drives), and on hosts without
    // one the fallback fails fast once and is remembered. A configured
    // rendering service serves the same role remotely. Set
    // SCRAPE_JS_FALLBACK=0 to disable rendering entirely.
    jsFallbackEnabled: process.env.SCRAPE_JS_FALLBACK !== "0",
    enabledSourceKeys: list("SCRAPE_SOURCES"),
  };
}

/** Shared browser-realistic headers for the browser-free JSON API sources. */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-CA,en;q=0.9",
};

/** fetch() with a hard per-request timeout so a stalled API can't hang a run. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 12_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ---- external rendering service: Apify --------------------------------- */
/*
 * A headless-browser / rendering service lets us render JS-heavy sites
 * (CarGurus, the OEM new-car pages, JS dealer sites) from a host without a
 * local Chromium (e.g. Render) — Apify runs the actual browser on its own
 * infrastructure and hands back whatever the page function extracts. The
 * specific reason to use Apify rather than a generic rendering API: its
 * Proxy product includes residential IPs, which is the one lever that can
 * plausibly get past a site that blocks by IP reputation (CarGurus's
 * DataDome) rather than by browser/JS fingerprinting — a plain datacenter
 * IP gets the same 403 whether or not a real browser is behind it, confirmed
 * live earlier (see cargurus.ts's comment).
 *
 * Uses the `apify/web-scraper` actor (Puppeteer-based, official, stable) with
 * a minimal pageFunction that just returns the rendered HTML — deliberately
 * NOT one of Apify's higher-level "content crawler" actors, which extract
 * readable text/markdown and typically strip the `<script>` JSON-LD blocks
 * and embedded state objects this app's extractor relies on.
 *
 * Configure with:
 *   APIFY_TOKEN            required — your Apify API token.
 *   APIFY_ACTOR_ID         optional — default "apify~web-scraper" (~ separates
 *                          the username/actor-name in Apify's URL paths).
 *   APIFY_PROXY_GROUPS     optional — comma list of Apify Proxy groups,
 *                          default "RESIDENTIAL". Set to "NONE" to disable
 *                          proxying (cheaper/faster, but back to a
 *                          datacenter-ish IP — only useful for JS-rendering
 *                          needs that aren't also being IP-blocked).
 *   APIFY_PROXY_COUNTRY    optional — 2-letter country code (e.g. "CA") to
 *                          bias the residential IP toward; unset = any.
 *   RENDER_SERVICE_TIMEOUT_MS  optional per-render cap (default 45000 — an
 *                          actor run has more overhead than a direct API
 *                          call: cold start, navigation, the page function).
 */
const APIFY_BASE = "https://api.apify.com/v2";

export function renderServiceConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
}

export interface RenderServiceResult {
  html: string | null;
  /** Why `html` is null — status code + a body snippet, or the thrown error's
   *  message. Lets a caller log something more useful than "returned nothing"
   *  (auth/param error vs. quota exhausted vs. the target itself blocked the
   *  proxy's IP too — three very different problems that look identical
   *  without this). */
  failureReason?: string;
}

/** JS run inside the actor's browser page — kept intentionally minimal: wait
 *  briefly for client-side rendering, then hand back the raw HTML as-is so
 *  this app's own 3-strategy extractor (JSON-LD / state-blob / DOM cards)
 *  runs against it exactly like any other rendered page. */
const RENDER_PAGE_FUNCTION = `async function pageFunction(context) {
  const { page, request } = context;
  await page.waitForTimeout(2500);
  return { url: request.url, html: await page.content() };
}`;

interface ApifyRunResult {
  items: Record<string, unknown>[] | null;
  failureReason?: string;
}

/** Shared plumbing for calling an Apify actor synchronously and getting its
 *  dataset items back: auth, proxy config, timeout, and — the one hard
 *  lesson from the ScrapingBee integration this replaced — never swallow the
 *  actual failure. Every caller gets the real HTTP status/body or dataset
 *  shape on failure, not just "it didn't work". */
async function runApifyActor(input: Record<string, unknown>): Promise<ApifyRunResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { items: null, failureReason: "APIFY_TOKEN not set" };

  const actorId = process.env.APIFY_ACTOR_ID || "apify~web-scraper";
  const groups = (process.env.APIFY_PROXY_GROUPS ?? "RESIDENTIAL").trim();
  const country = process.env.APIFY_PROXY_COUNTRY?.trim();
  const timeoutMs = num("RENDER_SERVICE_TIMEOUT_MS", 45_000);

  const proxyConfiguration =
    groups.toUpperCase() === "NONE"
      ? { useApifyProxy: false }
      : {
          useApifyProxy: true,
          apifyProxyGroups: groups.split(",").map((g) => g.trim()).filter(Boolean),
          ...(country ? { apifyProxyCountry: country } : {}),
        };

  const runUrl =
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=${Math.ceil(timeoutMs / 1000)}`;

  try {
    const res = await fetchWithTimeout(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proxyConfiguration, maxPagesPerCrawl: 1, maxResultsPerCrawl: 1, maxCrawlingDepth: 0, ...input }),
      timeoutMs,
    });
    const body = await res.text();
    if (!res.ok) {
      return { items: null, failureReason: `HTTP ${res.status}: ${body.slice(0, 300).replace(/\s+/g, " ")}` };
    }
    let items: unknown;
    try {
      items = JSON.parse(body);
    } catch {
      return { items: null, failureReason: `non-JSON response: ${body.slice(0, 200).replace(/\s+/g, " ")}` };
    }
    return Array.isArray(items) ? { items: items as Record<string, unknown>[] } : { items: null, failureReason: `unexpected response shape (not an array): ${body.slice(0, 200)}` };
  } catch (e) {
    return { items: null, failureReason: `request threw: ${(e as Error).message.slice(0, 150)}` };
  }
}

export async function fetchRenderedViaService(targetUrl: string): Promise<RenderServiceResult> {
  const { items, failureReason } = await runApifyActor({ startUrls: [{ url: targetUrl }], pageFunction: RENDER_PAGE_FUNCTION });
  if (!items) return { html: null, failureReason };
  const first = items[0];
  const html = typeof first?.html === "string" ? first.html : null;
  if (!html || html.length <= 500) {
    // Surface the actual shape we got back — Apify actor output fields can
    // vary by version, and guessing silently is exactly how the LAST
    // rendering-service integration went undiagnosed for multiple rounds.
    return { html: null, failureReason: `no usable "html" field in the actor's dataset item: ${JSON.stringify(first).slice(0, 300)}` };
  }
  return { html };
}

export interface ApifyInPageFetchResult {
  text: string | null;
  failureReason?: string;
}

/** JS run inside the actor's browser page for the in-page-fetch case: after
 *  the actor navigates to `startUrls` (letting the target's bot challenge
 *  resolve — cookies, JS fingerprint), fetch `apiUrl` FROM WITHIN that same
 *  page context so it inherits the resolved session, exactly like a real
 *  browser tab making an XHR after the page loaded (mirrors crawl.ts's local
 *  openBrowserSession/fetchJsonInSession, but on Apify's infra + proxy). */
function inPageFetchFunction(apiUrl: string): string {
  return `async function pageFunction(context) {
    const { page } = context;
    await page.waitForTimeout(1500);
    return page.evaluate(async (url) => {
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
        return { status: r.status, text: await r.text() };
      } catch (e) {
        return { status: 0, text: "", error: String(e) };
      }
    }, ${JSON.stringify(apiUrl)});
  }`;
}

/** Navigate to `warmupUrl` on Apify's infrastructure (residential proxy by
 *  default), then fetch `apiUrl` from inside that page and return its body
 *  text. Used by Clutch's retry tier for models the direct JSON API call
 *  couldn't reach, when no local browser is available (e.g. Render). */
export async function fetchViaApifyInPageFetch(warmupUrl: string, apiUrl: string): Promise<ApifyInPageFetchResult> {
  const { items, failureReason } = await runApifyActor({
    startUrls: [{ url: warmupUrl }],
    pageFunction: inPageFetchFunction(apiUrl),
  });
  if (!items) return { text: null, failureReason };
  const first = items[0];
  const status = typeof first?.status === "number" ? first.status : null;
  const text = typeof first?.text === "string" ? first.text : null;
  if (status !== 200 || !text) {
    return { text: null, failureReason: `in-page fetch got status ${status}: ${JSON.stringify(first).slice(0, 250)}` };
  }
  return { text };
}
