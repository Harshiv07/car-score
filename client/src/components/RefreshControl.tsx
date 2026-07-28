import { useEffect, useRef, useState } from "react";
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
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-line-strong hover:text-text"
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

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [status?.logs.length, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
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
            className="absolute right-0 top-0 flex h-full w-[min(92vw,30rem)] flex-col border-l border-line bg-surface shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-text">
                Crawl activity
                {running && <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />}
              </h3>
              <button
                onClick={onClose}
                aria-label="Close activity"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-surface2 hover:text-text"
              >
                ✕
              </button>
            </header>

            {status && (
              <div className="border-b border-line px-4 py-3 text-xs text-muted">
                {running ? (
                  <span className="nums">
                    Scanning {status.currentSource ?? "…"} ({status.sourcesDone}/{status.sourcesTotal})
                  </span>
                ) : (
                  <span>Idle — {status.logs.length} line(s) from the last run.</span>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
              {(status?.logs.length ?? 0) === 0 && (
                <p className="text-faint">Nothing logged yet. Run a refresh to see the crawler work.</p>
              )}
              {status?.logs.map((log, i) => (
                <div
                  key={i}
                  className={log.level === "error" ? "text-bad" : log.level === "warn" ? "text-warn" : "text-muted"}
                >
                  <span className="text-faint">{log.time.slice(11, 19)}</span> {log.message}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
