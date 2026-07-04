import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useScrapeStatus, useStartScrape } from "../api/hooks";
import { ApiError } from "../api/client";

function fmtCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * "Refresh Listings" — POSTs /api/scrape, shows live progress + logs while
 * running, and enforces the 10-minute cooldown with a visible countdown.
 */
export function RefreshButton() {
  const { data: status, dataUpdatedAt } = useScrapeStatus();
  const start = useStartScrape();
  const qc = useQueryClient();
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const wasRunning = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Local 1s tick so the cooldown countdown moves between refetches.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // When a run finishes, refresh the leaderboard and meta.
  useEffect(() => {
    if (wasRunning.current && status && !status.running) {
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["meta"] });
    }
    wasRunning.current = status?.running ?? false;
    if (status?.running) setShowLogs(true);
  }, [status?.running, qc, status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [status?.logs.length]);

  const running = status?.running ?? false;
  // Age the server-reported cooldown by the time elapsed since it was fetched
  // (`tick` re-renders every second so the countdown visibly moves).
  void tick;
  const elapsed = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : 0;
  const cooldown = Math.max(0, (status?.cooldownSecondsRemaining ?? 0) - elapsed);
  const disabled = running || cooldown > 0 || start.isPending;

  const onClick = async () => {
    setError(null);
    try {
      await start.mutateAsync();
      setShowLogs(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start scrape");
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={onClick}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Scraping {status?.currentSource ?? "…"} ({status?.sourcesDone}/{status?.sourcesTotal})
            </>
          ) : cooldown > 0 ? (
            <>Refresh available in {fmtCountdown(cooldown)}</>
          ) : (
            <>⟳ Refresh Listings</>
          )}
        </button>
        {(status?.logs.length ?? 0) > 0 && (
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {showLogs ? "Hide logs" : "Logs"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">{error}</p>}

      {running && status && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-cyan-500 transition-all duration-500"
            style={{ width: `${(status.sourcesDone / Math.max(1, status.sourcesTotal)) * 100}%` }}
          />
        </div>
      )}

      {showLogs && (status?.logs.length ?? 0) > 0 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed dark:border-slate-800 dark:bg-slate-950">
          {status?.logs.map((log, i) => (
            <div
              key={i}
              className={
                log.level === "error"
                  ? "text-red-500"
                  : log.level === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-600 dark:text-slate-400"
              }
            >
              <span className="text-slate-400 dark:text-slate-600">{log.time.slice(11, 19)}</span> {log.message}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
