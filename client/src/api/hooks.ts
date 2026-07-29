import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client";
import {
  InventoryStats,
  ListingDetailResponse,
  ListingsResponse,
  MetaResponse,
  NewCarsResponse,
  ScrapeProgress,
} from "./types";

export function useListings(params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: ["listings", qs],
    queryFn: () => apiGet<ListingsResponse>(`/api/listings${qs ? `?${qs}` : ""}`),
    staleTime: 30_000,
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
