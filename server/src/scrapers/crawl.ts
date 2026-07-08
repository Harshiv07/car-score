/**
 * Crawl helpers shared by every scraper.
 *
 * `crawlPages` — Crawlee CheerioCrawler (got-scraping under the hood sends
 * browser-realistic headers). This is the primary path for every source.
 *
 * `fetchWithPlaywright` — real-browser fallback, used ONLY when the Cheerio
 * pass yields nothing on a JS-rendered site. Kept deliberately small: one
 * page at a time, resources blocked, short timeout.
 *
 * `openBrowserSession` / `fetchJsonInSession` — a longer-lived browser page
 * used to make an API call from WITHIN a real, WAF-cleared browser context
 * (as opposed to a bare server-side fetch). Some APIs (Clutch) block a plain
 * fetch from a datacenter IP even with browser-shaped headers, but accept the
 * exact same request when it's actually issued by `fetch()` running inside a
 * page that navigated there first — the page load lets the site's bot
 * challenge (AWS WAF token, cookies, JS fingerprint) resolve normally, and the
 * in-page fetch inherits all of it. One page is reused for every subsequent
 * call so the cost (browser launch + navigation) is paid once per run, not
 * once per request.
 */

import { Browser, Page } from "playwright";
import { CheerioCrawler, Configuration, ProxyConfiguration, log as crawleeLog, LogLevel } from "crawlee";
import { LogFn } from "./types";
import { fetchRenderedViaService, renderServiceConfigured } from "./config";

crawleeLog.setLevel(LogLevel.OFF);

/** Honor standard egress-proxy env vars (corporate/PaaS environments). */
function proxyConfig(): ProxyConfiguration | undefined {
  const url = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  return url ? new ProxyConfiguration({ proxyUrls: [url] }) : undefined;
}

export interface CrawledPage {
  url: string;
  html: string;
}

export interface CrawlOutcome {
  pages: CrawledPage[];
  blocked: boolean;
  errors: string[];
}

export interface CrawlOptions {
  /** Parallel requests. Default 4. */
  concurrency?: number;
  /** Per-request handler timeout (seconds). Default 20. */
  requestTimeoutSecs?: number;
  /** Retries per request. Default 0 — a slow/blocked page must not be retried
   *  into a multi-minute stall; the run just moves on. */
  maxRetries?: number;
}

export async function crawlPages(
  urls: string[],
  log: LogFn,
  opts: CrawlOptions = {}
): Promise<CrawlOutcome> {
  const pages: CrawledPage[] = [];
  const errors: string[] = [];
  let blocked = false;

  const config = new Configuration({ persistStorage: false });
  const crawler = new CheerioCrawler(
    {
      proxyConfiguration: proxyConfig(),
      maxConcurrency: opts.concurrency ?? 4,
      maxRequestRetries: opts.maxRetries ?? 0,
      requestHandlerTimeoutSecs: opts.requestTimeoutSecs ?? 20,
      // Never let a single hung navigation exceed the handler budget.
      navigationTimeoutSecs: opts.requestTimeoutSecs ?? 20,
      // Cap total work so a mis-sized URL list can't balloon the run.
      maxRequestsPerCrawl: urls.length,
      additionalMimeTypes: ["application/json"],
      async requestHandler({ request, body }) {
        pages.push({ url: request.url, html: body.toString() });
      },
      failedRequestHandler({ request }, error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/403|429|blocked|captcha|datadome/i.test(msg)) blocked = true;
        errors.push(`${request.url}: ${msg}`);
        log("warn", `fetch failed: ${request.url} (${msg.slice(0, 120)})`);
      },
    },
    config
  );

  await crawler.run(urls.map((url) => ({ url })));
  return { pages, blocked, errors };
}

/**
 * Render a page to HTML, preferring a configured external rendering service
 * (works on hosts without Chromium, e.g. Render) and falling back to a local
 * Playwright browser. Returns rendered HTML or null.
 */
export async function renderPage(url: string, log: LogFn): Promise<string | null> {
  if (renderServiceConfigured()) {
    const html = await fetchRenderedViaService(url);
    if (html) return html;
    log("warn", `render service returned nothing for ${url}; trying local browser`);
  }
  return fetchWithPlaywright(url, log);
}

/**
 * Once a launch fails because no browser binary is installed, remember it —
 * every later fallback in the same process would fail identically, so we log
 * the actionable message once instead of once per source.
 */
let browserUnavailable = false;

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Launch a local Chromium, or null if unavailable (logs the reason once). */
async function launchBrowser(log: LogFn): Promise<Browser | null> {
  if (browserUnavailable) return null;
  try {
    const { chromium } = await import("playwright");
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    return await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      proxy: proxyUrl ? { server: proxyUrl } : undefined,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (/Executable doesn't exist|browserType.launch/i.test(msg)) {
      browserUnavailable = true;
      log(
        "warn",
        "Browser fallback disabled: Chromium is not installed (or can't launch) on this host. " +
          "See README for how to enable it on your deploy host."
      );
    } else {
      log("warn", `browser launch failed: ${msg.slice(0, 120)}`);
    }
    return null;
  }
}

/** Real-browser fallback (Playwright/Chromium). Returns rendered HTML or null. */
export async function fetchWithPlaywright(url: string, log: LogFn): Promise<string | null> {
  const browser = await launchBrowser(log);
  if (!browser) return null;
  try {
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT, locale: "en-CA" });
    await page.route("**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,mp4}", (r) => r.abort());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500); // let client-side lists hydrate
    return await page.content();
  } catch (e) {
    log("warn", `playwright fallback failed for ${url}: ${(e as Error).message.slice(0, 120)}`);
    return null;
  } finally {
    await browser.close();
  }
}

export interface BrowserSession {
  browser: Browser;
  page: Page;
}

/**
 * Launch a browser, navigate once to `warmupUrl` and leave the page open —
 * this is what lets the site's bot challenge resolve (cookies, JS
 * fingerprint) before any API calls are made through it. Returns null if no
 * browser is available (same graceful no-op as every other Playwright path).
 */
export async function openBrowserSession(warmupUrl: string, log: LogFn): Promise<BrowserSession | null> {
  const browser = await launchBrowser(log);
  if (!browser) return null;
  try {
    const page = await browser.newPage({ userAgent: DEFAULT_USER_AGENT, locale: "en-CA" });
    await page.route("**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,mp4}", (r) => r.abort());
    await page.goto(warmupUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500); // let the challenge / cookies settle
    return { browser, page };
  } catch (e) {
    log("warn", `browser session warmup failed: ${(e as Error).message.slice(0, 120)}`);
    await browser.close().catch(() => {});
    return null;
  }
}

/**
 * Fetch `url` from WITHIN the session's page (real fetch(), real cookies) and
 * return the response body as text, or null on any non-200 / error.
 */
export async function fetchJsonInSession(session: BrowserSession, url: string): Promise<string | null> {
  try {
    const result = await session.page.evaluate(async (u: string) => {
      const r = await fetch(u, { headers: { Accept: "application/json" }, credentials: "include" });
      return { status: r.status, text: await r.text() };
    }, url);
    return result.status === 200 ? result.text : null;
  } catch {
    return null;
  }
}

export async function closeBrowserSession(session: BrowserSession | null): Promise<void> {
  if (session) await session.browser.close().catch(() => {});
}
