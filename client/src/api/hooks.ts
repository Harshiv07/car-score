import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client";
import {
  InventoryStats,
  ListingDetailResponse,
  ListingsResponse,
  MapPoint,
  MetaResponse,
  NewCarsResponse,
  ScrapeProgress,
} from "./types";

/**
 * One canonical query string per set of parameters: keys sorted, so
 * `?make=X&page=2` and `?page=2&make=X` are the same cache entry. Without this,
 * a page fetched ahead of time under one ordering is a miss when the reader
 * navigates there under another.
 */
function canonicalQs(params: URLSearchParams): string {
  return new URLSearchParams([...params.entries()].sort(([a], [b]) => a.localeCompare(b))).toString();
}

function listingsQuery(params: URLSearchParams) {
  const qs = canonicalQs(params);
  return {
    queryKey: ["listings", qs] as const,
    queryFn: () => apiGet<ListingsResponse>(`/api/listings${qs ? `?${qs}` : ""}`),
    staleTime: 30_000,
  };
}

/**
 * Keep the pages around the one on screen warm.
 *
 * Paging used to be a round trip every time: against the deployed API that is
 * most of a second, and tens of seconds when it has spun down. Reading a list
 * is sequential, so the next pages are the ones to fetch before they are asked
 * for. Once the current page has landed this fetches the next `ahead` pages and
 * the previous `behind`, and every page turn then re-runs it, so the window
 * keeps sliding: showing page 2 fetches 3 and 4, showing 3 fetches 4 and 5.
 * Pages already in the cache (and still fresh) cost nothing.
 */
export function usePrefetchListingPages(
  params: URLSearchParams,
  page: number,
  totalPages: number,
  enabled: boolean,
  { ahead = 2, behind = 1 } = {}
) {
  const qc = useQueryClient();
  const base = canonicalQs(params);
  useEffect(() => {
    if (!enabled) return;
    const wanted: number[] = [];
    for (let i = 1; i <= ahead; i++) wanted.push(page + i);
    for (let i = 1; i <= behind; i++) wanted.push(page - i);
    for (const p of wanted) {
      if (p < 1 || p > totalPages) continue;
      const next = new URLSearchParams(base);
      // Page one is requested without a page parameter, as the pager does.
      if (p <= 1) next.delete("page");
      else next.set("page", String(p));
      void qc.prefetchQuery(listingsQuery(next));
    }
  }, [qc, base, page, totalPages, enabled, ahead, behind]);
}

export function useListings(params: URLSearchParams) {
  return useQuery({
    ...listingsQuery(params),
    // Changing a filter or turning a page is a new query key, so by default the
    // list would blank to skeletons and rebuild while the request is in flight.
    // Holding the previous results means the page changes rather than reloads —
    // invisible against a 2ms local API, very visible against the deployed one.
    // `isFetching` still exposes the in-flight state for a quiet indicator.
    placeholderData: keepPreviousData,
  });
}

/** Compact points for the market map, for the same filters as the list. Only
 *  fetched while the map is on screen. */
export function useMarketMap(params: URLSearchParams, enabled: boolean) {
  const qs = params.toString();
  return useQuery({
    queryKey: ["marketMap", qs],
    queryFn: () => apiGet<{ total: number; points: MapPoint[] }>(`/api/listings/map${qs ? `?${qs}` : ""}`),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Inventory-wide aggregates for the leaderboard header.
 *
 * Computed server-side over the whole inventory. This used to be derived on the
 * client from the first 100 results of `sort=deal`, which made "average score"
 * the average of the best 100 cars and reported "1 source active" for a
 * four-source inventory, because the top 100 deals all came from one site.
 */
export function useListingStats() {
  return useQuery({
    queryKey: ["listingStats"],
    queryFn: () => apiGet<InventoryStats>("/api/listings/stats"),
    staleTime: 60_000,
  });
}

/**
 * Warm a listing's detail before it is asked for.
 *
 * The detail view waits on `/api/listings/:id`, and against the deployed API
 * that is most of the delay between clicking a card and reading anything.
 * Pointer-over or keyboard focus is a reliable few hundred milliseconds of
 * warning, which is usually the whole round trip — so by the time the click
 * lands the data is already in the React Query cache and the page paints
 * immediately.
 *
 * `staleTime` matches the query itself, so a prefetch that turns out to be
 * unnecessary is a single cached request, not a repeated one.
 */
export function usePrefetchListing() {
  const qc = useQueryClient();
  return (id: string) =>
    void qc.prefetchQuery({
      queryKey: ["listing", id],
      queryFn: () => apiGet<ListingDetailResponse>(`/api/listings/${id}`),
      staleTime: 30_000,
    });
}

export function useListingDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["listing", id],
    queryFn: () => apiGet<ListingDetailResponse>(`/api/listings/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: () => apiGet<MetaResponse>("/api/meta"),
    staleTime: 5 * 60_000,
  });
}

/** New-model lineup from official OEM sites. Polls while the backend is still
 *  rendering the client-side OEM pages in the background. */
export function useNewCars() {
  return useQuery({
    queryKey: ["newcars"],
    queryFn: () => apiGet<NewCarsResponse>("/api/newcars"),
    refetchInterval: (query) => (query.state.data?.loading ? 4000 : false),
    staleTime: 5 * 60_000,
  });
}

/** Polls fast while a scrape runs, slowly otherwise (to keep the cooldown timer fresh). */
export function useScrapeStatus() {
  return useQuery({
    queryKey: ["scrapeStatus"],
    queryFn: () => apiGet<ScrapeProgress>("/api/scrape/status"),
    refetchInterval: (query) => (query.state.data?.running ? 1500 : 30_000),
  });
}

export function useStartScrape() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ started: boolean; runId?: string }>("/api/scrape"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["scrapeStatus"] });
    },
  });
}
