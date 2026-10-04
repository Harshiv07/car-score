import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useListings, useListingStats, useMeta, useScrapeStatus } from "../api/hooks";
import { FiltersSidebar } from "../components/FiltersSidebar";
import { FilterDrawer } from "../components/FilterDrawer";
import { ListingRow } from "../components/ListingRow";
import { TopPickStage } from "../components/TopPickStage";
import { CompareTray } from "../components/CompareTray";
import { Pagination } from "../components/Pagination";
import { WakingNotice } from "../components/WakingNotice";
import { Icon } from "../components/Icon";
import { cad, Select, timeAgo } from "../components/ui";
import { gsap, useGSAP, SplitText, hasPlayed, markPlayed, prefersReducedMotion } from "../lib/motion";

const DEFAULT_PAGE_SIZE = 12;
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
  // Decided once per mount: the entrance plays on the first visit of a session.
  const [intro] = useState(() => !prefersReducedMotion() && !hasPlayed("leaderboard"));
  useEffect(() => markPlayed("leaderboard"), []);
  const headRef = useRef<HTMLElement>(null);

  const pageSize = readPageSize(params);
  const queryParams = useMemo(() => {
    const p = new URLSearchParams(params);
    p.set("pageSize", String(pageSize));
    return p;
  }, [params, pageSize]);

  const { data, isLoading, isError, error, isFetching } = useListings(queryParams);
  const listings = data?.listings ?? [];
  const { data: meta } = useMeta();
  const { data: stats } = useListingStats();
  const { data: scrape } = useScrapeStatus();

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

  // The page's one entrance: the headline rises line by line out of a mask.
  useGSAP(
    () => {
      if (!intro || !headRef.current) return;
      const h1 = headRef.current.querySelector("h1")!;
      SplitText.create(h1, {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, { yPercent: 105, duration: 0.9, ease: "power4.out", stagger: 0.09 }),
      });
      gsap.from(headRef.current.querySelectorAll("[data-after-head]"), {
        opacity: 0,
        duration: 0.6,
        delay: 0.45,
        stagger: 0.08,
      });
    },
    { scope: headRef, dependencies: [intro] }
  );

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-10 pt-8 sm:px-6 sm:pt-12">
      <header ref={headRef}>
        <h1 className="display max-w-[15ch] text-[clamp(2.5rem,6.4vw,5.25rem)] text-text">
          Which used car should you actually look at first?
        </h1>

        <div className={`mt-8 grid gap-8 ${hero ? "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-10" : ""}`}>
          <div className={hero ? "" : "grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"}>
            <p data-after-head className="max-w-[46ch] text-[17px] leading-relaxed text-muted">
              Every listing is scored out of 100 on reliability, real market value, winter capability and what it
              costs to run. The ranking reflects the car, not the asking price.
            </p>

            {/* Provenance, as a spec list. */}
            <dl data-after-head className={`grid grid-cols-2 gap-x-6 gap-y-4 ${hero ? "mt-8" : "md:min-w-[420px]"} text-[14px]`}>
              {stats ? (
                <>
                  <Spec label="Listings scored" value={stats.totalListings.toLocaleString("en-CA")} />
                  <Spec label="Sources crawled" value={String(stats.sourcesActive)} />
                  <Spec label="Rated excellent" value={stats.excellentDeals.toLocaleString("en-CA")} />
                  <Spec
                    label="Last refreshed"
                    value={scrape?.lastScrapeTime ? timeAgo(scrape.lastScrapeTime) : "Never"}
                  />
                  {stats.bestSavings > 0 && (
                    <div className="col-span-2 border-t border-line pt-4">
                      <dt className="label">Best find right now</dt>
                      <dd className="mt-1 text-text">
                        <span className="nums display text-[22px] text-good">{cad(stats.bestSavings)}</span>{" "}
                        <span className="text-muted">under market</span>
                        {stats.bestSavingsTitle && <span className="block text-[13px] text-faint">{stats.bestSavingsTitle}</span>}
                      </dd>
                    </div>
                  )}
                </>
              ) : (
                <div className="col-span-2 h-24 animate-pulse rounded-lg bg-surface" />
              )}
            </dl>
          </div>

          {hero && (
            <TopPickStage
              listing={hero}
              meta={meta}
              total={data?.totalUnfiltered ?? 0}
              filtered={isFiltered}
              intro={intro}
            />
          )}
        </div>
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
                    <span className="font-medium text-muted">, ranked by {sortLabel}</span>
                  </>
                )
              ) : (
                "Loading the ranking…"
              )}
            </h2>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDrawerOpen(true)}
                className="btn btn-ghost py-2 lg:hidden"
              >
                <Icon name="filters" size={16} />
                Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
              </button>
              <Select
                ariaLabel="Listings per page"
                className="hidden w-[7.75rem] sm:block"
                value={String(pageSize)}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} a page` }))}
                onChange={(v) => setParam("pageSize", v === String(DEFAULT_PAGE_SIZE) ? "" : v)}
              />
              <Select
                ariaLabel="Sort"
                className="w-44"
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

          {isLoading && (
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

          {data && data.listings.length === 0 && (
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

          {rest.length > 0 && (
            <div className="row-list divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {rest.map((l, i) => (
                <ListingRow key={l.id} listing={l} rank={(page - 1) * pageSize + i + 1 + (hero ? 1 : 0)} />
              ))}
            </div>
          )}

          {data && (
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

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="nums display mt-1 text-[22px] text-text">{value}</dd>
    </div>
  );
}
