import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useListings, useListingStats, useMeta, useScrapeStatus } from "../api/hooks";
import { FiltersSidebar } from "../components/FiltersSidebar";
import { ListingCard } from "../components/ListingCard";
import { Pagination } from "../components/Pagination";
import { RefreshButton } from "../components/RefreshButton";
import { Wordmark } from "../App";
import { cad, timeAgo } from "../components/ui";

const DEFAULT_PAGE_SIZE = 10;

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const queryParams = useMemo(() => {
    const p = new URLSearchParams(params);
    if (!p.has("pageSize")) p.set("pageSize", String(DEFAULT_PAGE_SIZE));
    return p;
  }, [params]);
  const { data, isLoading, isError, error } = useListings(queryParams);
  const { data: meta } = useMeta();
  const { data: stats } = useListingStats();
  const { data: scrape } = useScrapeStatus();

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        return next;
      },
      { replace: true }
    );
  };

  const sort = params.get("sort") ?? "score";
  const cooldownMin = Math.ceil((scrape?.cooldownSecondsRemaining ?? 0) / 60);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <div className="fade-up">
        <Wordmark className="text-4xl sm:text-5xl" />
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Best-value first cars, ranked by reliability, market value, winter capability and ownership cost —
          not just the lowest price.
        </p>
      </div>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Listings scanned"
          value={stats ? String(stats.totalListings) : "—"}
          sub={stats ? `${stats.sourcesActive} source${stats.sourcesActive === 1 ? "" : "s"} active` : ""}
        />
        <StatTile label="Average score" value={stats ? String(stats.avgScore) : "—"} sub="out of 100" tone="brand" />
        <StatTile
          label="Best savings found"
          value={stats && stats.bestSavings > 0 ? cad(stats.bestSavings) : "—"}
          sub={stats?.bestSavingsTitle ?? ""}
          tone="good"
        />
        <StatTile
          label="Last refresh"
          value={scrape?.lastScrapeTime ? timeAgo(scrape.lastScrapeTime) : "never"}
          sub={cooldownMin > 0 ? `cooldown clears in ${cooldownMin}m` : "ready to refresh"}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-20 lg:self-start">
          <FiltersSidebar
            meta={meta}
            params={params}
            onChange={setParam}
            onClear={() => setParams(new URLSearchParams(sort !== "score" ? { sort } : {}), { replace: true })}
          />
        </div>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {data ? (
                <>
                  <span className="nums font-bold text-text">{data.total}</span>
                  {" of "}
                  <span className="nums">{data.totalUnfiltered}</span> listings
                </>
              ) : (
                "Loading…"
              )}
            </p>
            <div className="flex items-center gap-2">
              <RefreshButton />
              <label className="flex items-center gap-2 text-sm text-muted">
                <span className="hidden sm:inline">Sort</span>
                <select
                  className="rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-sm font-semibold text-text focus:border-brand"
                  value={sort}
                  onChange={(e) => setParam("sort", e.target.value === "score" ? "" : e.target.value)}
                >
                  {(meta?.sortOptions ?? [{ key: "score", label: "Best Score" }]).map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {isError && (
            <div className="rounded-2xl border border-bad/40 bg-bad/10 p-4 text-sm text-bad">
              Failed to load listings: {(error as Error).message}
            </div>
          )}

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
          )}

          {data && data.listings.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-10 text-center text-muted">
              No listings match these filters.
            </div>
          )}

          <div className="space-y-3">
            {data?.listings.map((l, i) => (
              <ListingCard key={l.id} listing={l} rank={(data.page - 1) * data.pageSize + i + 1} />
            ))}
          </div>

          {data && (
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPage={(p) =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (p <= 1) next.delete("page");
                    else next.set("page", String(p));
                    return next;
                  },
                  { replace: true }
                )
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "brand" | "good";
}) {
  const color = tone === "brand" ? "text-brand" : tone === "good" ? "text-good" : "text-text";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className={`nums mt-1 text-2xl font-extrabold ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-faint" title={sub}>{sub}</div>}
    </div>
  );
}
