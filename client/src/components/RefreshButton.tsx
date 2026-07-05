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

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (wasRunning.current && status && !status.running) {
      void qc.invalidateQueries({ queryKey: ["listings"] });
      void qc.invalidateQueries({ queryKey: ["listingStats"] });
      void qc.invalidateQueries({ queryKey: ["meta"] });
    }
    wasRunning.current = status?.running ?? false;
    if (status?.running) setShowLogs(true);
  }, [status?.running, qc, status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [status?.logs.length]);

  const running = status?.running ?? false;
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
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-black shadow-sm transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              <span className="nums">
                {status?.currentSource ?? "…"} ({status?.sourcesDone}/{status?.sourcesTotal})
              </span>
            </>
          ) : cooldown > 0 ? (
            <span className="nums">Refresh in {fmtCountdown(cooldown)}</span>
          ) : (
            <>⟳ Refresh Listings</>
          )}
        </button>
        {(status?.logs.length ?? 0) > 0 && (
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-text"
          >
            {showLogs ? "Hide logs" : "Logs"}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm font-medium text-bad">{error}</p>}

      {running && status && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${(status.sourcesDone / Math.max(1, status.sourcesTotal)) * 100}%` }}
          />
        </div>
      )}

      {showLogs && (status?.logs.length ?? 0) > 0 && (
        <div className="absolute right-0 z-10 mt-2 max-h-64 w-[min(92vw,32rem)] overflow-y-auto rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11px] leading-relaxed shadow-xl">
          {status?.logs.map((log, i) => (
            <div
              key={i}
              className={
                log.level === "error" ? "text-bad" : log.level === "warn" ? "text-brand" : "text-muted"
              }
            >
              <span className="text-faint">{log.time.slice(11, 19)}</span> {log.message}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
