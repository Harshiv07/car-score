import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client";
import {
  ListingDetailResponse,
  ListingsResponse,
  MetaResponse,
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

/** Aggregate stats for the leaderboard KPI row (whole inventory, best-savings first). */
export function useListingStats() {
  return useQuery({
    queryKey: ["listingStats"],
    queryFn: () => apiGet<ListingsResponse>("/api/listings?pageSize=100&sort=deal"),
    staleTime: 30_000,
    select: (data) => {
      const ls = data.listings;
      const avgScore = ls.length ? Math.round(ls.reduce((s, l) => s + l.score.total, 0) / ls.length) : 0;
      const best = ls.reduce<(typeof ls)[number] | null>(
        (b, l) => (l.score.market.savings > (b?.score.market.savings ?? -Infinity) ? l : b),
        null
      );
      const sources = new Set(ls.map((l) => l.sourceWebsite));
      return {
        totalListings: data.totalUnfiltered,
        avgScore,
        bestSavings: best && best.score.market.savings > 0 ? best.score.market.savings : 0,
        bestSavingsTitle: best?.title ?? null,
        sourcesActive: sources.size,
      };
    },
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
