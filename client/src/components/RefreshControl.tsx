import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useScrapeStatus, useStartScrape } from "../api/hooks";
import { ApiError } from "../api/client";
import { usePresence } from "../hooks/usePresence";
import { Icon } from "./Icon";
import { timeAgo } from "./ui";

/**
 * Data freshness.
 *
 * Refreshing runs the crawler — maintenance, not search — so it lives in the
 * header, says how current the data is, and opens only when asked. While a
 * crawl runs, a thin bar along the bottom of the header tracks it.
 */

function fmtCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RefreshControl() {
  const { data: status, dataUpdatedAt } = useScrapeStatus();
  const start = useStartScrape();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const wasRunning = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pop = usePresence(open, 160);

  // Keeps the cooldown countdown moving between status polls.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // A finished run means every cached view of the inventory is stale.
  useEffect(() => {
    if (wasRunning.current && status && !status.running) {
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["listingStats"] });
      void qc.invalidateQueries({ queryKey: ["meta"] });
    }
    wasRunning.current = status?.running ?? false;
  }, [status?.running, qc, status]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const running = status?.running ?? false;
  const elapsed = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : 0;
  const cooldown = Math.max(0, (status?.cooldownSecondsRemaining ?? 0) - elapsed);
  const blocked = running || cooldown > 0 || start.isPending;
  const progress = running && status ? status.sourcesDone / Math.max(1, status.sourcesTotal) : 0;

  const run = async () => {
    setError(null);
    try {
      await start.mutateAsync();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the refresh. Try again in a moment.");
    }
  };

  const statusText = running
    ? `Scanning ${status?.sourcesDone ?? 0} of ${status?.sourcesTotal ?? 0}`
    : status?.lastScrapeTime
      ? `Updated ${timeAgo(status.lastScrapeTime)}`
      : "Never updated";

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Data freshness: ${statusText}`}
          title="Data freshness"
          className="flex h-9 min-w-9 items-center justify-center gap-2 rounded-full px-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-surface2 hover:text-text"
        >
          <span className="relative grid place-items-center">
            <Icon name="refresh" size={17} className={running ? "spin text-accent-ink" : ""} />
          </span>
          <span className="hidden sm:inline">{statusText}</span>
        </button>

        {pop.mounted && (
          <div
            role="dialog"
            aria-label="Data freshness"
            data-state={pop.state}
            className="pop absolute right-0 z-50 mt-2 w-[20rem] rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow)]"
          >
            <h3 className="wide text-[15px] font-bold text-text">Listing data</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {running
                ? `Scanning ${status?.currentSource ?? "sources"}: ${status?.sourcesDone} of ${status?.sourcesTotal} done.`
                : status?.lastScrapeTime
                  ? `Last crawled ${timeAgo(status.lastScrapeTime)}. Refreshing re-scans every source for new and updated cars.`
                  : "No crawl has run yet. Refreshing scans every source for listings."}
            </p>

            {running && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.max(4, progress * 100)}%` }}
                />
              </div>
            )}

            {error && <p className="mt-2 text-[13px] font-medium text-bad">{error}</p>}

            <div className="mt-3 flex items-center gap-2">
              <button onClick={run} disabled={blocked} className="btn btn-primary flex-1 py-2 disabled:cursor-not-allowed disabled:opacity-45">
                {running ? "Refreshing…" : cooldown > 0 ? `Available in ${fmtCountdown(cooldown)}` : "Refresh now"}
              </button>
              <button
                onClick={() => {
                  setShowLogs(true);
                  setOpen(false);
                }}
                className="btn btn-ghost py-2"
              >
                Activity
              </button>
            </div>

            {cooldown > 0 && !running && (
              <p className="mt-2 text-[12px] text-faint">One crawl every 10 minutes, so sources aren't hammered.</p>
            )}
          </div>
        )}
      </div>

      {running && (
        <div className="pointer-events-none absolute inset-x-0 -bottom-px h-[2px] bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-700" style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>
      )}

      <ActivityDrawer open={showLogs} onClose={() => setShowLogs(false)} status={status} running={running} />
    </>
  );
}

function elapsedSince(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const LEVEL: Record<string, { rail: string; text: string; label: string }> = {
  error: { rail: "bg-bad", text: "text-bad", label: "Error" },
  warn: { rail: "bg-fair", text: "text-fair", label: "Warning" },
  info: { rail: "bg-line-strong", text: "text-muted", label: "" },
};

/**
 * The crawl log. Messages wrap and the timestamp keeps its own column; the
 * header answers "is this stuck?" with progress, elapsed time and a tally.
 * Portalled to <body>: the sticky header's backdrop-filter would otherwise
 * become the containing block for this fixed panel.
 */
function ActivityDrawer({
  open,
  onClose,
  status,
  running,
}: {
  open: boolean;
  onClose: () => void;
  status: ReturnType<typeof useScrapeStatus>["data"];
  running: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const p = usePresence(open, 320);

  useEffect(() => {
    if (!open || !running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open, running]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [status?.logs.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!p.mounted) return null;

  const logs = status?.logs ?? [];
  const counts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.level] = (acc[l.level] ?? 0) + 1;
    return acc;
  }, {});
  const progress = status && status.sourcesTotal > 0 ? status.sourcesDone / status.sourcesTotal : 0;
  const elapsed = elapsedSince(status?.startedAt ?? null);

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Crawl activity">
      <div data-state={p.state} onClick={onClose} className="overlay absolute inset-0 bg-black/45" />
      <aside
        data-state={p.state}
        data-side="right"
        className="sheet absolute right-0 top-0 flex h-full w-[min(94vw,32rem)] flex-col border-l border-line bg-surface shadow-[var(--shadow)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h3 className="wide flex items-center gap-2 text-[15px] font-bold text-text">
            Crawl activity
            {running && <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-label="Running" />}
          </h3>
          <button onClick={onClose} aria-label="Close activity" className="icon-btn">
            <Icon name="close" />
          </button>
        </header>

        <div className="shrink-0 border-b border-line px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-text">
              {running ? (
                <>
                  Scanning <span className="font-semibold">{status?.currentSource ?? "…"}</span>
                </>
              ) : status?.lastScrapeTime ? (
                <>Last run finished {timeAgo(status.lastScrapeTime)}</>
              ) : (
                "No crawl has run yet"
              )}
            </p>
            {status && status.sourcesTotal > 0 && (
              <span className="nums shrink-0 text-[13px] font-semibold text-muted">
                {status.sourcesDone} of {status.sourcesTotal}
              </span>
            )}
          </div>
          {status && status.sourcesTotal > 0 && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${running ? "bg-accent" : "bg-good"}`}
                style={{ width: `${Math.max(3, progress * 100)}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
            {running && elapsed && <span className="nums">Running for {elapsed}</span>}
            {logs.length > 0 && <span className="nums">{logs.length} lines</span>}
            {counts.warn > 0 && <span className="nums text-fair">{counts.warn} warnings</span>}
            {counts.error > 0 && <span className="nums text-bad">{counts.error} errors</span>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <p className="text-sm font-semibold text-text">Nothing logged yet</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Start a refresh and each source reports here as it's scanned: how many listings it returned, and
                anything it couldn't reach.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {logs.map((log, i) => {
                const s = LEVEL[log.level] ?? LEVEL.info;
                return (
                  <li key={`${log.time}-${i}`} className="flex gap-3 px-5 py-2">
                    <span className={`mt-1 w-0.5 shrink-0 self-stretch rounded-full ${s.rail}`} aria-hidden />
                    <time className="nums cond mt-px shrink-0 text-[12px] leading-5 text-faint" dateTime={log.time}>
                      {log.time.slice(11, 19)}
                    </time>
                    <span className={`min-w-0 flex-1 break-words text-[13px] leading-5 ${s.text}`}>
                      {s.label && <span className="mr-1.5 font-bold">{s.label}</span>}
                      {log.message}
                    </span>
                  </li>
                );
              })}
              <div ref={endRef} />
            </ul>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
