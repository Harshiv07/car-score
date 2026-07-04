/**
 * Scrape orchestration.
 *
 * Runs each active scraper in turn, but under a hard, configurable budget so a
 * run can never hang (the original symptom): the whole run is capped at
 * `SCRAPE_RUN_BUDGET_MS` (default 2 min) and each source at
 * `SCRAPE_SOURCE_TIMEOUT_MS`. The crawl itself is fire-and-forget and yields
 * the event loop between pages, so the listings API keeps responding while a
 * scrape is in progress.
 */

import { randomUUID } from "crypto";
import { ScrapeHistoryEntry, ScrapeProgress } from "../types";
import { getStorage } from "../db/storage";
import { activeScrapers } from "../scrapers";
import { loadScrapeConfig } from "../scrapers/config";
import { LogFn, Scraper, ScraperRunResult } from "../scrapers/types";

export const COOLDOWN_MS = 10 * 60 * 1000;
const MAX_LOGS = 200;

interface RunState {
  running: boolean;
  runId: string | null;
  startedAt: string | null;
  currentSource: string | null;
  sourcesDone: number;
  sourcesTotal: number;
  logs: ScrapeProgress["logs"];
}

const state: RunState = {
  running: false,
  runId: null,
  startedAt: null,
  currentSource: null,
  sourcesDone: 0,
  sourcesTotal: 0,
  logs: [],
};

function pushLog(level: "info" | "warn" | "error", message: string) {
  state.logs.push({ time: new Date().toISOString(), level, message });
  if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
}

export async function getLastScrapeTime(): Promise<string | null> {
  const storage = await getStorage();
  const last = await storage.getLastCompletedScrape();
  return last?.finishedAt ?? last?.startedAt ?? null;
}

export async function cooldownRemainingMs(): Promise<number> {
  const last = await getLastScrapeTime();
  if (!last) return 0;
  const elapsed = Date.now() - new Date(last).getTime();
  return Math.max(0, COOLDOWN_MS - elapsed);
}

export async function getProgress(): Promise<ScrapeProgress> {
  return {
    running: state.running,
    runId: state.runId,
    startedAt: state.startedAt,
    currentSource: state.currentSource,
    sourcesDone: state.sourcesDone,
    sourcesTotal: state.sourcesTotal,
    logs: state.logs,
    lastScrapeTime: await getLastScrapeTime(),
    cooldownSecondsRemaining: Math.ceil((await cooldownRemainingMs()) / 1000),
  };
}

export type StartResult =
  | { started: true; runId: string }
  | { started: false; reason: "running" | "cooldown"; cooldownSecondsRemaining: number };

export async function startScrape(): Promise<StartResult> {
  if (state.running) {
    return { started: false, reason: "running", cooldownSecondsRemaining: 0 };
  }
  const remaining = await cooldownRemainingMs();
  if (remaining > 0) {
    return { started: false, reason: "cooldown", cooldownSecondsRemaining: Math.ceil(remaining / 1000) };
  }

  const runId = `run_${randomUUID().slice(0, 8)}`;
  const sources = activeScrapers();
  state.running = true;
  state.runId = runId;
  state.startedAt = new Date().toISOString();
  state.currentSource = null;
  state.sourcesDone = 0;
  state.sourcesTotal = sources.length;
  state.logs = [];

  // Fire and forget — progress is polled via GET /api/scrape/status.
  void runScrape(runId, sources).catch((e) => {
    pushLog("error", `scrape run crashed: ${(e as Error).message}`);
    state.running = false;
  });

  return { started: true, runId };
}

/**
 * Race a scraper against a deadline so one stalled source can't consume the
 * whole run. On timeout we return an empty, non-OK result and move on; the
 * scraper's own tight request timeouts mean it will unwind shortly after.
 */
export async function runWithTimeout(scraper: Scraper, log: LogFn, timeoutMs: number): Promise<ScraperRunResult> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<ScraperRunResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          key: scraper.key,
          source: scraper.source,
          listings: [],
          ok: false,
          note: `timed out after ${Math.round(timeoutMs / 1000)}s`,
        }),
      timeoutMs
    );
  });
  try {
    return await Promise.race([scraper.run(log), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runScrape(runId: string, sources: Scraper[]): Promise<void> {
  const cfg = loadScrapeConfig();
  const deadline = Date.now() + cfg.runBudgetMs;
  const storage = await getStorage();
  const entry: ScrapeHistoryEntry = {
    id: runId,
    startedAt: state.startedAt as string,
    finishedAt: null,
    status: "running",
    totalFound: 0,
    totalInserted: 0,
    totalUpdated: 0,
    sources: [],
  };
  await storage.addScrapeHistory(entry);
  pushLog(
    "info",
    `Scrape ${runId} started — ${sources.length} source(s), ${Math.round(cfg.runBudgetMs / 1000)}s budget.`
  );

  for (const scraper of sources) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) {
      pushLog("warn", `Run budget exhausted — skipping ${sources.length - state.sourcesDone} remaining source(s).`);
      break;
    }
    state.currentSource = scraper.source;
    const perSource = Math.min(cfg.sourceTimeoutMs, remaining);
    try {
      const result = await runWithTimeout(scraper, pushLog, perSource);
      entry.sources.push({
        source: result.source,
        found: result.listings.length,
        ok: result.ok,
        note: result.note,
      });
      entry.totalFound += result.listings.length;
      if (result.listings.length > 0) {
        const { inserted, updated } = await storage.upsertListings(result.listings);
        entry.totalInserted += inserted;
        entry.totalUpdated += updated;
        pushLog("info", `${result.source}: ${inserted} new, ${updated} refreshed.`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      entry.sources.push({ source: scraper.source, found: 0, ok: false, note: msg.slice(0, 200) });
      pushLog("error", `${scraper.source}: scraper threw — ${msg.slice(0, 200)}`);
    }
    state.sourcesDone++;
    await new Promise((r) => setImmediate(r)); // keep the API responsive between sources
  }

  entry.status = "completed";
  entry.finishedAt = new Date().toISOString();
  await storage.updateScrapeHistory(entry);
  const elapsed = Math.round((Date.now() - new Date(entry.startedAt).getTime()) / 1000);
  pushLog(
    "info",
    `Scrape complete in ${elapsed}s: ${entry.totalFound} found, ${entry.totalInserted} new, ${entry.totalUpdated} refreshed.`
  );
  if (entry.totalFound === 0) {
    pushLog(
      "warn",
      "Every source returned 0 listings. Most Canadian car sites block automated access from datacenter IPs " +
        "(Render, etc.) via AWS WAF / DataDome / Cloudflare. Run `npm run scrape:check -w server` to confirm the " +
        "extraction pipeline itself is healthy, and try SCRAPE_JS_FALLBACK=1 locally for the HTML sources."
    );
  }
  state.running = false;
  state.currentSource = null;
}
