import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useListings,
  useListingStats,
  useMarketMap,
  useMeta,
  usePrefetchListingPages,
} from "../api/hooks";
import { MarketMap } from "../components/MarketMap";
import { FiltersSidebar } from "../components/FiltersSidebar";
import { FilterDrawer } from "../components/FilterDrawer";
import { ListingRow } from "../components/ListingRow";
import { TopPickCard } from "../components/TopPickCard";
import { CompareTray } from "../components/CompareTray";
import { Pagination } from "../components/Pagination";
import { WakingNotice } from "../components/WakingNotice";
import { Icon } from "../components/Icon";
import { Segmented, Select } from "../components/ui";

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZES = [12, 24, 48] as const;

function readPageSize(params: URLSearchParams): number {
  const n = Number(params.get("pageSize"));
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/** Params that aren't filters, for counting how many filters are actually on. */
const NON_FILTER_PARAMS = ["sort", "page", "pageSize", "view"];

export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageSize = readPageSize(params);
  const queryParams = useMemo(() => {
    const p = new URLSearchParams(params);
    p.set("pageSize", String(pageSize));
    return p;
  }, [params, pageSize]);

  const view = params.get("view") === "map" ? "map" : "list";
  const { data, isLoading, isError, error, isFetching, isPlaceholderData } = useListings(queryParams);
  const listings = data?.listings ?? [];
  // Once this page is really here (not the previous one held as a placeholder),
  // fetch the next two pages and the previous one, so turning a page is instant.
  usePrefetchListingPages(
    queryParams,
    data?.page ?? 1,
    data ? Math.ceil(data.total / pageSize) : 0,
    !!data && !isPlaceholderData && view === "list"
  );
  const mapParams = useMemo(() => {
    const p = new URLSearchParams(params);
    NON_FILTER_PARAMS.forEach((k) => p.delete(k));
    return p;
  }, [params]);
  const { data: mapData, isLoading: mapLoading } = useMarketMap(mapParams, view === "map");
  const { data: meta } = useMeta();
  const { data: stats } = useListingStats();

  // Stable identity so the memoised sidebar doesn't redraw on every result.
  const setParam = useCallback(
    (key: string, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          // Brand and model change in the same update, or they clobber each other.
          if (key === "make") next.delete("model");
          if (key === "yearMin" && value && Number(next.get("yearMax") ?? Infinity) < Number(value)) next.delete("yearMax");
          if (key === "yearMax" && value && Number(next.get("yearMin") ?? 0) > Number(value)) next.delete("yearMin");
          next.delete("page");
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const sort = params.get("sort") ?? "score";
  const activeFilters = [...params.keys()].filter((k) => !NON_FILTER_PARAMS.includes(k)).length;
  const clearAll = useCallback(
    () => setParams(new URLSearchParams(sort !== "score" ? { sort } : {}), { replace: true }),
    [setParams, sort]
  );

  const isFiltered = activeFilters > 0;
  const page = data?.page ?? 1;
  // The stage answers the current question, so it leads page one of the
  // default ranking. Under another sort, or deeper in, the list is the answer.
  const hero = page === 1 && sort === "score" ? listings[0] : undefined;
  const rest = hero ? listings.slice(1) : listings;
  const sortLabel = meta?.sortOptions.find((o) => o.key === sort)?.label.toLowerCase() ?? "best score";

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1 className="display text-[26px]">Best used cars</h1>
          {stats ? (
            <p className="nums text-[12.5px] text-muted">
              {stats.totalListings.toLocaleString("en-CA")} cars · {stats.excellentDeals.toLocaleString("en-CA")} excellent
            </p>
          ) : (
            <span className="h-4 w-56 animate-pulse bg-surface" aria-hidden />
          )}
        </div>

        {hero && (
          <div className="mt-4">
            <TopPickCard listing={hero} meta={meta} filtered={isFiltered} />
          </div>
        )}
      </header>

      <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <FiltersSidebar meta={meta} params={params} onChange={setParam} onClear={clearAll} />
        </div>

        <section id="results" aria-labelledby="results-heading" className="scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 id="results-heading" className="wide text-[22px] font-bold text-text" aria-live="polite">
              {isFetching && !isLoading && (
                <span className="spin mr-2 inline-block h-3.5 w-3.5 rounded-full border-2 border-line border-t-accent align-[1px]" aria-hidden />
              )}
              {data ? (
                isFiltered ? (
                  <>
                    <span className="nums">{data.total.toLocaleString("en-CA")}</span>
                    <span className="font-medium text-muted">
                      {" "}
                      of <span className="nums">{data.totalUnfiltered.toLocaleString("en-CA")}</span> cars match
                    </span>
                  </>
                ) : (
                  <>
                    <span className="nums">{data.total.toLocaleString("en-CA")}</span> cars
                    <span className="font-medium text-muted">
                      {view === "map" ? ", by price and mileage" : `, ranked by ${sortLabel}`}
                    </span>
                  </>
                )
              ) : (
                "Loading the ranking…"
              )}
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="btn btn-ghost py-2 lg:hidden"
              >
                <Icon name="filters" size={16} />
                Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
              </button>
              <div className="w-[8.5rem]">
                <Segmented
                  ariaLabel="View"
                  value={view}
                  options={[
                    { value: "list", label: "List" },
                    { value: "map", label: "Map" },
                  ]}
                  onChange={(v) => setParam("view", v === "map" ? "map" : "")}
                />
              </div>
              <Select
                ariaLabel="Listings per page"
                className={`${view === "map" ? "hidden" : "hidden sm:block"} w-[7.75rem]`}
                value={String(pageSize)}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} a page` }))}
                onChange={(v) => setParam("pageSize", v === String(DEFAULT_PAGE_SIZE) ? "" : v)}
              />
              <Select
                ariaLabel="Sort"
                className={`${view === "map" ? "hidden" : ""} w-44`}
                value={sort}
                options={(meta?.sortOptions ?? [{ key: "score", label: "Best Score" }]).map((o) => ({
                  value: o.key,
                  label: o.label.charAt(0) + o.label.slice(1).toLowerCase(),
                }))}
                onChange={(v) => setParam("sort", v === "score" ? "" : v)}
              />
            </div>
          </div>

          <WakingNotice active={isLoading} />

          {isError && (
            <div className="rounded-[var(--radius-card)] border border-bad/40 bg-bad/5 p-5">
              <p className="text-sm font-semibold text-bad">Couldn't load listings.</p>
              <p className="mt-1 text-sm text-muted">{(error as Error).message}</p>
              <p className="mt-2 text-sm text-muted">
                The API may still be starting up. Reload the page, or run a refresh once it's back.
              </p>
            </div>
          )}

          {view === "map" && (
            mapData ? (
              <MarketMap points={mapData.points} />
            ) : (
              <div className="h-[420px] animate-pulse rounded-[var(--radius-card)] bg-surface" aria-busy={mapLoading} />
            )
          )}

          {view === "list" && isLoading && (
            <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface" aria-label="Loading listings">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-5 p-5">
                  <div className="h-24 w-36 shrink-0 animate-pulse rounded-[10px] bg-surface2" />
                  <div className="flex-1 space-y-3 pt-1">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-surface2" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-surface2" />
                    <div className="h-2 w-72 max-w-full animate-pulse rounded bg-surface2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "list" && data && data.listings.length === 0 && (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center">
              {/* Two different empty states: an empty inventory isn't a filter problem. */}
              {data.totalUnfiltered === 0 ? (
                <>
                  <p className="wide text-[20px] font-bold text-text">No listings yet.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                    Nothing has been crawled into the database yet. Run a refresh from the header to scan every
                    source. It takes a few minutes.
                  </p>
                </>
              ) : (
                <>
                  <p className="wide text-[20px] font-bold text-text">No cars match these filters.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                    Widen the price or mileage range, or drop the brand filter to see what else is close.
                  </p>
                  {isFiltered && (
                    <button onClick={clearAll} className="btn btn-primary mt-5">
                      Clear all filters
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {view === "list" && rest.length > 0 && (
            <div className="row-list sticker divide-y divide-line">
              {rest.map((l, i) => (
                <ListingRow key={l.id} listing={l} rank={(page - 1) * pageSize + i + 1 + (hero ? 1 : 0)} />
              ))}
            </div>
          )}

          {view === "list" && data && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPage={(p) => {
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (p <= 1) next.delete("page");
                    else next.set("page", String(p));
                    return next;
                  },
                  { replace: true }
                );
                document.getElementById("results")?.scrollIntoView({ block: "start" });
              }}
            />
          )}
        </section>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeCount={activeFilters}
        resultCount={data?.total}
      >
        <FiltersSidebar meta={meta} params={params} onChange={setParam} onClear={clearAll} inDrawer />
      </FilterDrawer>

      <CompareTray />
    </div>
  );
}

