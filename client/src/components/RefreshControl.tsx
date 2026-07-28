import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useScrapeStatus, useStartScrape } from "../api/hooks";
import { ApiError } from "../api/client";
import { timeAgo } from "./ui";

/**
 * Data-freshness control.
 *
 * Refreshing runs the crawler — it's maintenance, not search. It used to sit in
 * the results toolbar styled as a gold primary button next to Sort, which read
 * as "the main thing to do here", and it auto-opened a full-screen log drawer
 * the moment a run started. Now it lives in the header beside the nav, states
 * how current the data is, and only opens anything when asked.
 *
 * While a run is in progress the page gets a slim determinate progress bar
 * under the header, so progress is ambient rather than modal.
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
    ? `Scanning ${status?.sourcesDone ?? 0}/${status?.sourcesTotal ?? 0}`
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
          // The accessible name leads with what the control is, and still
          // contains the visible text so voice control can target it.
          aria-label={`Data freshness — ${statusText}`}
          title="Data freshness"
          className="flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-line-strong hover:text-text"
        >
          <motion.span
            aria-hidden
            className={running ? "text-brand" : "text-faint"}
            animate={running ? { rotate: 360 } : { rotate: 0 }}
            transition={running ? { repeat: Infinity, ease: "linear", duration: 1.4 } : { duration: 0.2 }}
          >
            ⟳
          </motion.span>
          <span className="hidden sm:inline">{statusText}</span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              role="dialog"
              aria-label="Data freshness"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
              className="absolute right-0 z-50 mt-2 w-[19rem] origin-top-right rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-black/40"
            >
              <h3 className="font-display text-sm font-bold text-text">Listing data</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {running
                  ? `Scanning ${status?.currentSource ?? "sources"} — ${status?.sourcesDone}/${status?.sourcesTotal} done.`
                  : status?.lastScrapeTime
                    ? `Last crawled ${timeAgo(status.lastScrapeTime)}. Refreshing re-scans every source for new and updated cars.`
                    : "No crawl has run yet. Refreshing scans every source for listings."}
              </p>

              {running && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface2">
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    animate={{ width: `${Math.max(4, progress * 100)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              )}

              {error && <p className="mt-2 text-xs font-medium text-bad">{error}</p>}

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={run}
                  disabled={blocked}
                  className="flex-1 rounded-lg bg-brand px-3 py-2 text-xs font-bold transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: "var(--on-brand)" }}
                >
                  {running
                    ? "Refreshing…"
                    : cooldown > 0
                      ? `Available in ${fmtCountdown(cooldown)}`
                      : "Refresh now"}
                </button>
                <button
                  onClick={() => {
                    setShowLogs(true);
                    setOpen(false);
                  }}
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-text"
                >
                  Activity
                </button>
              </div>

              {cooldown > 0 && !running && (
                <p className="mt-2 text-[11px] text-faint">
                  Crawls are limited to one every 10 minutes so sources aren't hammered.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ambient progress under the header while a crawl runs. */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-surface2"
            aria-hidden
          >
            <motion.div
              className="h-full bg-brand"
              animate={{ width: `${Math.max(3, progress * 100)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ActivityDrawer open={showLogs} onClose={() => setShowLogs(false)} status={status} running={running} />
    </>
  );
}

/** Elapsed wall-clock for a run, as "1m 24s". */
function elapsedSince(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const LEVEL_STYLES: Record<string, { rail: string; text: string; label: string }> = {
  error: { rail: "bg-bad", text: "text-bad", label: "Error" },
  warn: { rail: "bg-warn", text: "text-warn", label: "Warn" },
  info: { rail: "bg-line-strong", text: "text-muted", label: "Info" },
};

/**
 * The crawl activity log.
 *
 * Rewritten around three problems. Crawler messages are long — things like
 * "Clutch: combined query returned 118 (Tucson, CR-V, CX-5, Elantra, Corolla,
 * Civic)…" — and they sat in a `font-mono` block with no wrapping, so a line ran
 * off the right edge: the timestamp and the start of the sentence scrolled out
 * of view, leaving text that began mid-list. Messages now wrap, and the
 * timestamp holds its own fixed column that cannot be pushed away.
 *
 * Second, a run that had produced one line left a screen of empty black beneath
 * it. The empty state is now centred in the panel instead of clinging to the
 * top, and the list is sized by its content.
 *
 * Third, the panel gave a line count but no sense of progress. There is now a
 * bar, the elapsed time, and a warning/error tally, so "is this stuck?" can be
 * answered without reading every line.
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

  // Keeps the elapsed timer honest between status polls.
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

  const logs = status?.logs ?? [];
  const counts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.level] = (acc[l.level] ?? 0) + 1;
    return acc;
  }, {});
  const progress = status && status.sourcesTotal > 0 ? status.sourcesDone / status.sourcesTotal : 0;
  const elapsed = elapsedSince(status?.startedAt ?? null);

  // Portalled to <body> deliberately. This control lives inside the sticky
  // header, which uses `backdrop-blur-md` — and a `backdrop-filter` ancestor
  // becomes the containing block for `position: fixed` descendants. Rendered in
  // place, the panel's `fixed inset-0` resolved against the 56px-tall header
  // instead of the viewport, so the drawer was 56px tall and its log list
  // computed to zero height. Escaping to <body> is the fix.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Crawl activity">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute right-0 top-0 flex h-full w-[min(94vw,32rem)] flex-col border-l border-line bg-surface shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-text">
                Crawl activity
                {running && (
                  <span className="relative flex h-2 w-2" aria-label="Running">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                  </span>
                )}
              </h3>
              <button
                onClick={onClose}
                aria-label="Close activity"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface2 hover:text-text"
              >
                ✕
              </button>
            </header>

            {/* Status block: what is happening, how far in, how long it has taken. */}
            <div className="shrink-0 border-b border-line px-4 py-3">
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
                  <span className="nums shrink-0 text-xs font-semibold text-muted">
                    {status.sourcesDone}/{status.sourcesTotal}
                  </span>
                )}
              </div>

              {status && status.sourcesTotal > 0 && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
                  <motion.div
                    className={`h-full rounded-full ${running ? "bg-brand" : "bg-good"}`}
                    animate={{ width: `${Math.max(3, progress * 100)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                {running && elapsed && <span className="nums">running {elapsed}</span>}
                {logs.length > 0 && <span className="nums">{logs.length} lines</span>}
                {counts.warn > 0 && <span className="nums text-warn">{counts.warn} warnings</span>}
                {counts.error > 0 && <span className="nums text-bad">{counts.error} errors</span>}
              </div>
            </div>

            {/* Log list. Messages wrap; the timestamp keeps its own column. */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                  <p className="text-sm font-semibold text-text">Nothing logged yet</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    Start a refresh and each source reports here as it is scanned — how many listings it
                    returned, and anything it could not reach.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line/60">
                  {logs.map((log, i) => {
                    const style = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info;
                    return (
                      <li key={`${log.time}-${i}`} className="flex gap-2.5 px-4 py-2">
                        <span className={`mt-1 w-0.5 shrink-0 self-stretch rounded-full ${style.rail}`} aria-hidden />
                        <time
                          className="nums mt-px shrink-0 font-mono text-[10px] leading-5 text-faint"
                          dateTime={log.time}
                        >
                          {log.time.slice(11, 19)}
                        </time>
                        <span className={`min-w-0 flex-1 break-words text-xs leading-5 ${style.text}`}>
                          {log.level !== "info" && (
                            <span className="mr-1.5 font-bold uppercase">{style.label}</span>
                          )}
                          {log.message}
                        </span>
                      </li>
                    );
                  })}
                  <div ref={endRef} />
                </ul>
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
