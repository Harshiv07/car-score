import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { useInfiniteListings, useListingStats, useMeta, useScrapeStatus } from "../api/hooks";
import { FiltersSidebar } from "../components/FiltersSidebar";
import { FilterDrawer } from "../components/FilterDrawer";
import { ListingCard } from "../components/ListingCard";
import { TopPick } from "../components/TopPick";
import { CompareTray } from "../components/CompareTray";
import { InfiniteSentinel } from "../components/InfiniteSentinel";
import { cad, Select, timeAgo } from "../components/ui";

const DEFAULT_PAGE_SIZE = 12;

/** How many cars arrive per batch. Kept in the URL so a chosen size survives a
 *  reload and travels with a shared link, like every other view setting here. */
const PAGE_SIZES = [12, 24, 48] as const;

function readPageSize(params: URLSearchParams): number {
  const n = Number(params.get("pageSize"));
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/** Params that aren't filters, for counting how many filters are actually on. */
const NON_FILTER_PARAMS = ["sort", "page", "pageSize"];

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageSize = readPageSize(params);

  // `page` is owned by the infinite query; `pageSize` is the reader's choice and
  // is passed to it explicitly, so neither belongs in the filter key.
  const queryParams = useMemo(() => {
    const p = new URLSearchParams(params);
    p.delete("page");
    p.delete("pageSize");
    return p;
  }, [params]);

  const {
    data: pages,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteListings(queryParams, pageSize);

  // Flattened view of every page loaded so far.
  const first = pages?.pages[0];
  const listings = useMemo(() => pages?.pages.flatMap((p) => p.listings) ?? [], [pages]);
  const data = first
    ? { total: first.total, totalUnfiltered: first.totalUnfiltered, listings, page: 1, pageSize }
    : undefined;
  const { data: meta } = useMeta();
  const { data: stats } = useListingStats();
  const { data: scrape } = useScrapeStatus();

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        // Changing brand resets the model (done in the SAME update — two
        // separate setSearchParams calls each see the old params and clobber
        // each other, which is why the brand filter appeared to do nothing).
        if (key === "make") next.delete("model");
        // Defensive: a year bound that inverts the range clears the other bound
        // (the selects already hide invalid options; this guards URL edits).
        if (key === "yearMin" && value && Number(next.get("yearMax") ?? Infinity) < Number(value)) next.delete("yearMax");
        if (key === "yearMax" && value && Number(next.get("yearMin") ?? 0) > Number(value)) next.delete("yearMin");
        next.delete("page");
        return next;
      },
      { replace: true }
    );
  };

  const sort = params.get("sort") ?? "score";
  const activeFilters = [...params.keys()].filter((k) => !NON_FILTER_PARAMS.includes(k)).length;
  const clearAll = () => setParams(new URLSearchParams(sort !== "score" ? { sort } : {}), { replace: true });

  const isFiltered = activeFilters > 0;
  // The hero answers the current question. Under an explicit sort the list
  // itself is the answer, so it steps aside.
  const hero = sort === "score" ? listings[0] : undefined;
  const rest = hero ? listings.slice(1) : listings;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Thesis — the question this page answers, not a second wordmark. */}
      <header className="fade-up max-w-2xl">
        <h1 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-text sm:text-[42px]">
          Which used car should you
          <br className="hidden sm:block" /> actually look at first?
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Every listing scored out of 100 on reliability, real market value, winter capability and what it costs to
          run — so the ranking reflects the car, not the asking price.
        </p>

        {/* Provenance, as one honest line rather than four decorative tiles. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          {stats ? (
            <>
              <Metric value={stats.totalListings.toLocaleString("en-CA")} label="listings" />
              <Dot />
              <Metric value={String(stats.sourcesActive)} label={stats.sourcesActive === 1 ? "source" : "sources"} />
              <Dot />
              <Metric value={String(stats.excellentDeals)} label="rated excellent" />
              {stats.bestSavings > 0 && (
                <>
                  <Dot />
                  <span>
                    best find <span className="nums font-semibold text-good">{cad(stats.bestSavings)}</span> under
                    market
                  </span>
                </>
              )}
              <Dot />
              <span>refreshed {scrape?.lastScrapeTime ? timeAgo(scrape.lastScrapeTime) : "never"}</span>
            </>
          ) : (
            <span className="inline-block h-4 w-72 max-w-full animate-pulse rounded bg-surface" />
          )}
        </div>
      </header>

      {/* Hero: the best match for the current query. */}
      {hero && (
        <div className="mt-7">
          <TopPick listing={hero} />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[264px_1fr]">
        {/* Desktop filters. On mobile these live in the drawer instead, so the
            first thing under the header is a car and not a control panel. */}
        <div className="hidden rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-20 lg:block lg:self-start">
          <FiltersSidebar meta={meta} params={params} onChange={setParam} onClear={clearAll} />
        </div>

        <div id="results">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {data ? (
                <>
                  <span className="nums font-bold text-text">{data.total.toLocaleString("en-CA")}</span>
                  {isFiltered ? (
                    <>
                      {" of "}
                      <span className="nums">{data.totalUnfiltered.toLocaleString("en-CA")}</span> cars match
                    </>
                  ) : (
                    " cars ranked"
                  )}
                  <span className="text-faint">
                    {" · showing "}
                    <span className="nums">{listings.length.toLocaleString("en-CA")}</span>
                  </span>
                </>
              ) : (
                "Loading…"
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-text transition hover:border-line-strong lg:hidden"
              >
                Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
              </button>
              <div className="hidden items-center gap-2 text-sm text-muted sm:flex">
                <span className="hidden lg:inline">Show</span>
                <Select
                  ariaLabel="Listings per batch"
                  className="w-[5.5rem]"
                  value={String(pageSize)}
                  options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(v) => setParam("pageSize", v === String(DEFAULT_PAGE_SIZE) ? "" : v)}
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-muted">
                <span className="hidden sm:inline">Sort</span>
                <Select
                  ariaLabel="Sort"
                  className="w-40 sm:w-44"
                  value={sort}
                  options={(meta?.sortOptions ?? [{ key: "score", label: "Best Score" }]).map((o) => ({
                    value: o.key,
                    label: o.label,
                  }))}
                  onChange={(v) => setParam("sort", v === "score" ? "" : v)}
                />
              </div>
            </div>
          </div>

          {isError && (
            <div className="rounded-2xl border border-bad/40 bg-bad/10 p-5">
              <p className="text-sm font-semibold text-bad">Couldn't load listings.</p>
              <p className="mt-1 text-sm text-muted">{(error as Error).message}</p>
              <p className="mt-2 text-sm text-muted">
                The API may still be starting up. Reload the page, or run a refresh once it's back.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="space-y-3" aria-label="Loading listings">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface" />
              ))}
            </div>
          )}

          {data && data.listings.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-10 text-center">
              {/* Two different empty states. "No cars match these filters" is
                  wrong — and actively misleading — when the inventory itself is
                  empty and no filter is set: it sends someone to widen a range
                  that was never narrowed. Distinguish the cases by whether the
                  unfiltered inventory has anything in it. */}
              {data.totalUnfiltered === 0 ? (
                <>
                  <p className="font-display text-lg font-bold text-text">No listings yet.</p>
                  <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                    Nothing has been crawled into the database yet. Run a refresh from the header to scan every
                    source — it takes a few minutes.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-lg font-bold text-text">No cars match these filters.</p>
                  <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
                    Widen the price or mileage range, or drop the brand filter to see what else is close.
                  </p>
                  {isFiltered && (
                    <button
                      onClick={clearAll}
                      className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-bold transition hover:bg-brand-strong"
                      style={{ color: "var(--on-brand)" }}
                    >
                      Clear all filters
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Cards settle in sequence rather than snapping in as a block. The
              stagger is capped so a full page never feels like it's queueing. */}
          <div className="card-list space-y-3">
            {rest?.map((l, i) => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min((i % pageSize) * 0.035, 0.28), ease: [0.4, 0, 0.2, 1] }}
              >
                <ListingCard listing={l} rank={i + 1 + (hero ? 1 : 0)} />
              </motion.div>
            ))}
          </div>

          {data && (
            <InfiniteSentinel
              hasMore={!!hasNextPage}
              isLoading={isFetchingNextPage}
              onLoadMore={() => void fetchNextPage()}
              remaining={Math.max(0, data.total - listings.length)}
              batchSize={pageSize}
            />
          )}
        </div>
      </div>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} activeCount={activeFilters}>
        <FiltersSidebar meta={meta} params={params} onChange={setParam} onClear={clearAll} />
      </FilterDrawer>

      <CompareTray />
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span className="nums font-semibold text-text">{value}</span> {label}
    </span>
  );
}

function Dot() {
  return <span aria-hidden>·</span>;
}
