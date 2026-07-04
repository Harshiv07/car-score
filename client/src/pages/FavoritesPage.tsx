import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useListings } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { ListingCard } from "../components/ListingCard";

const ALL = new URLSearchParams({ pageSize: "100" });

export function FavoritesPage() {
  const { ids } = useFavorites();
  const { data, isLoading } = useListings(ALL);

  const favorites = useMemo(
    () => (data ? data.listings.filter((l) => ids.includes(l.id)) : []),
    [data, ids]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Favourites</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Cars you've hearted from the leaderboard. Saved in this browser.
      </p>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        )}

        {!isLoading && favorites.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-3xl">♡</p>
            <p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">No favourites yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tap the heart on any listing to shortlist it here.
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
            >
              Browse listings
            </Link>
          </div>
        )}

        {favorites.map((l, i) => (
          <ListingCard key={l.id} listing={l} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}
