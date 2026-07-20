/**
 * Central, env-driven scrape configuration.
 *
 * Every knob has a fast, safe default so a plain `npm run dev` scrape finishes
 * well under two minutes and never hangs. Everything can be tightened or
 * loosened from the environment (or `.env`) without touching code — this is the
 * mechanism the task calls for: "reduce the number of sites or pages to confirm
 * that it is able to scrape data".
 *
 *   SCRAPE_RUN_BUDGET_MS    hard cap on the whole run (default 120000 = 2 min)
 *   SCRAPE_SOURCE_TIMEOUT_MS per-source cap (default 30000)
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
    runBudgetMs: num("SCRAPE_RUN_BUDGET_MS", 120_000),
    sourceTimeoutMs: num("SCRAPE_SOURCE_TIMEOUT_MS", 30_000),
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

/* ---- external rendering service ----------------------------------------- */
/*
 * A headless-browser / rendering service lets us render JS-heavy sites
 * (AutoTrader, the OEM new-car pages, JS dealer sites) from a host without a
 * local Chromium (e.g. Render). Configure with:
 *
 *   RENDER_SERVICE_URL   a template that returns the rendered HTML for a target
 *                        URL. Two shapes are supported:
 *                          - contains "{url}"  → GET, {url} replaced with the
 *                            URL-encoded target (ScrapingBee, ScraperAPI, …),
 *                            e.g. https://app.scrapingbee.com/api/v1/?api_key=KEY&render_js=true&url={url}
 *                          - no "{url}"        → POST { url } as JSON
 *                            (Browserless /content, etc.)
 *   RENDER_SERVICE_API_KEY  optional; sent as `x-api-key` / bearer on POST mode.
 *   RENDER_SERVICE_TIMEOUT_MS  optional per-render cap (default 30000).
 */
export function renderServiceConfigured(): boolean {
  return !!process.env.RENDER_SERVICE_URL;
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

export async function fetchRenderedViaService(targetUrl: string): Promise<RenderServiceResult> {
  const template = process.env.RENDER_SERVICE_URL;
  if (!template) return { html: null, failureReason: "RENDER_SERVICE_URL not set" };
  const timeoutMs = num("RENDER_SERVICE_TIMEOUT_MS", 30_000);
  const apiKey = process.env.RENDER_SERVICE_API_KEY;
  try {
    let res: Response;
    if (template.includes("{url}")) {
      res = await fetchWithTimeout(template.replace("{url}", encodeURIComponent(targetUrl)), {
        headers: BROWSER_HEADERS,
        timeoutMs,
      });
    } else {
      res = await fetchWithTimeout(template, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey, Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ url: targetUrl, gotoOptions: { waitUntil: "networkidle2" } }),
        timeoutMs,
      });
    }
    const body = await res.text();
    if (!res.ok) {
      return { html: null, failureReason: `HTTP ${res.status}: ${body.slice(0, 200).replace(/\s+/g, " ")}` };
    }
    if (!body || body.length <= 500) {
      return {
        html: null,
        failureReason: `response too short (${body.length} bytes) to be a real page: ${body.slice(0, 200).replace(/\s+/g, " ")}`,
      };
    }
    return { html: body };
  } catch (e) {
    return { html: null, failureReason: `request threw: ${(e as Error).message.slice(0, 150)}` };
  }
}
