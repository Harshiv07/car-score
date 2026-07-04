/**
 * Scrape orchestration: runs every registered scraper sequentially, streams
 * progress + logs to the status endpoint, dedupes/upserts results, and
 * enforces the 10-minute cooldown between runs.
 */

import { randomUUID } from "crypto";
import { ScrapeHistoryEntry, ScrapeProgress } from "../types";
import { getStorage } from "../db/storage";
import { scrapers } from "../scrapers";

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
  sourcesTotal: scrapers.length,
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
  state.running = true;
  state.runId = runId;
  state.startedAt = new Date().toISOString();
  state.currentSource = null;
  state.sourcesDone = 0;
  state.sourcesTotal = scrapers.length;
  state.logs = [];

  // Fire and forget — progress is polled via GET /api/scrape/status.
  void runScrape(runId).catch((e) => {
    pushLog("error", `scrape run crashed: ${(e as Error).message}`);
    state.running = false;
  });

  return { started: true, runId };
}

async function runScrape(runId: string): Promise<void> {
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
  pushLog("info", `Scrape ${runId} started — ${scrapers.length} sources.`);

  for (const scraper of scrapers) {
    state.currentSource = scraper.source;
    try {
      const result = await scraper.run(pushLog);
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
  }

  entry.status = "completed";
  entry.finishedAt = new Date().toISOString();
  await storage.updateScrapeHistory(entry);
  pushLog(
    "info",
    `Scrape complete: ${entry.totalFound} found, ${entry.totalInserted} new, ${entry.totalUpdated} refreshed.`
  );
  state.running = false;
  state.currentSource = null;
}
