/**
 * Crawl helpers shared by every scraper.
 *
 * `crawlPages` — Crawlee CheerioCrawler (got-scraping under the hood sends
 * browser-realistic headers). This is the primary path for every source.
 *
 * `fetchWithPlaywright` — real-browser fallback, used ONLY when the Cheerio
 * pass yields nothing on a JS-rendered site. Kept deliberately small: one
 * page at a time, resources blocked, short timeout.
 */

import { CheerioCrawler, Configuration, ProxyConfiguration, log as crawleeLog, LogLevel } from "crawlee";
import { LogFn } from "./types";

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
 * Once a launch fails because no browser binary is installed, remember it —
 * every later fallback in the same process would fail identically, so we log
 * the actionable message once instead of once per source.
 */
let browserUnavailable = false;

/** Real-browser fallback (Playwright/Chromium). Returns rendered HTML or null. */
export async function fetchWithPlaywright(url: string, log: LogFn): Promise<string | null> {
  if (browserUnavailable) return null;
  try {
    const { chromium } = await import("playwright");
    const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      proxy: proxyUrl ? { server: proxyUrl } : undefined,
    });
    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        locale: "en-CA",
      });
      await page.route("**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,mp4}", (r) => r.abort());
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2500); // let client-side lists hydrate
      const html = await page.content();
      return html;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (/Executable doesn't exist|browserType.launch/i.test(msg)) {
      browserUnavailable = true;
      log(
        "warn",
        "Browser fallback disabled: Chromium is not installed on this host. " +
          "Add `npx playwright install chromium` to the build command (see README) to enable it."
      );
    } else {
      log("warn", `playwright fallback failed for ${url}: ${msg.slice(0, 120)}`);
    }
    return null;
  }
}
