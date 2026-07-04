import { useSearchParams } from "react-router-dom";
import { useListings, useMeta } from "../api/hooks";
import { FiltersSidebar } from "../components/FiltersSidebar";
import { ListingCard } from "../components/ListingCard";
import { RefreshButton } from "../components/RefreshButton";

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, error } = useListings(params);
  const { data: meta } = useMeta();

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Best-value first cars
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ranked by a 100-point score across reliability, market value, winter capability and ownership cost —
            not just the lowest price.
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-20 lg:self-start">
          <FiltersSidebar
            meta={meta}
            params={params}
            onChange={setParam}
            onClear={() => setParams(new URLSearchParams(sort !== "score" ? { sort } : {}), { replace: true })}
          />
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {data ? (
                <>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{data.total}</span>
                  {" of "}
                  {data.totalUnfiltered} listings
                </>
              ) : (
                "Loading…"
              )}
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              Sort by
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-900 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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

          {isError && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Failed to load listings: {(error as Error).message}
            </div>
          )}

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
              ))}
            </div>
          )}

          {data && data.listings.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              No listings match these filters.
            </div>
          )}

          <div className="space-y-3">
            {data?.listings.map((l, i) => (
              <ListingCard key={l.id} listing={l} rank={(data.page - 1) * data.pageSize + i + 1} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
