import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useListings } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { ListingCard } from "../components/ListingCard";

const ALL = new URLSearchParams({ pageSize: "100" });

export function FavoritesPage() {
  const { ids, prune } = useFavorites();
  const { data, isLoading } = useListings(ALL);

  const favorites = useMemo(
    () => (data ? data.listings.filter((l) => ids.includes(l.dedupeKey)) : []),
    [data, ids]
  );

  // Once the full inventory is loaded, drop favourites that no longer exist.
  useEffect(() => {
    if (data) prune(data.listings.map((l) => l.dedupeKey));
  }, [data, prune]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-text">Favourites</h1>
      <p className="mt-1.5 text-sm text-muted">Cars you've hearted from the leaderboard. Saved in this browser.</p>

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}

        {!isLoading && favorites.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-12 text-center">
            <p className="text-4xl text-bad">♡</p>
            <p className="mt-3 font-semibold text-text">No favourites yet</p>
            <p className="mt-1 text-sm text-muted">Tap the heart on any listing to shortlist it here.</p>
            <Link
              to="/"
              className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold text-black transition hover:bg-brand-strong"
            >
              Browse listings
            </Link>
          </div>
        )}

        {favorites.map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </div>
  );
}
