import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useListings } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { ListingRow } from "../components/ListingRow";
import { CompareTray } from "../components/CompareTray";
import { Icon } from "../components/Icon";

/**
 * Saved cars, looked up by dedupeKey on the server — so anything saved from
 * deep in the leaderboard still appears, and only keys the server genuinely
 * no longer has are pruned.
 */
export function FavoritesPage() {
  const { ids, prune } = useFavorites();

  const params = useMemo(() => {
    const p = new URLSearchParams({ pageSize: "100" });
    if (ids.length) p.set("keys", ids.join(","));
    return p;
  }, [ids]);

  const { data, isLoading } = useListings(params);
  const saved = ids.length ? (data?.listings ?? []) : [];

  useEffect(() => {
    if (!data || ids.length === 0) return;
    prune(data.listings.map((l) => l.dedupeKey));
  }, [data, ids.length, prune]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-8 sm:px-6 sm:pt-12">
      <h1 className="display text-[clamp(2.25rem,5vw,3.75rem)] text-text">Saved cars</h1>
      <p className="mt-3 text-[15px] text-muted">
        Kept in this browser, no account needed.
        {saved.length > 0 ? ` ${saved.length} saved, best score first.` : ""}
      </p>

      <div className="mt-8">
        {isLoading && ids.length > 0 && (
          <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {Array.from({ length: Math.min(3, ids.length) }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse bg-surface2/50" />
            ))}
          </div>
        )}

        {!isLoading && saved.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface text-accent-ink">
              <Icon name="heart" size={22} />
            </span>
            <p className="wide mt-4 text-[20px] font-bold text-text">Nothing saved yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Tap the heart on any car to keep it here while you shop around.
            </p>
            <Link to="/" className="btn btn-primary mt-6">
              Browse the leaderboard
            </Link>
          </div>
        )}

        {saved.length > 0 && (
          <div className="row-list divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {[...saved]
              .sort((a, b) => b.score.total - a.score.total)
              .map((l) => (
                <ListingRow key={l.id} listing={l} />
              ))}
          </div>
        )}
      </div>

      <CompareTray />
    </div>
  );
}
