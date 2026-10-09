import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useListings } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { ListingRow } from "../components/ListingRow";
import { CompareTray } from "../components/CompareTray";
import { Icon } from "../components/Icon";

/**
 * Saved cars, looked up by dedupeKey on the server, so anything saved from
 * deep in the leaderboard still appears.
 *
 * A saved car the server no longer has is shown as "No longer listed", never
 * silently dropped: the refresh sweeps sold cars, and a saved list that quietly
 * shrinks looks like a bug. Nothing is ever removed on the reader's behalf;
 * and the claim is only made when it can be trusted, i.e. the inventory is not
 * empty (a cold or mid-scrape database knows nothing) and the response was not
 * cut off at the page size.
 */
export function FavoritesPage() {
  const { ids, toggle } = useFavorites();

  const params = useMemo(() => {
    const p = new URLSearchParams({ pageSize: "100" });
    if (ids.length) p.set("keys", ids.join(","));
    return p;
  }, [ids]);

  const { data, isLoading } = useListings(params);
  const saved = ids.length ? (data?.listings ?? []) : [];

  const trustworthy = !!data && data.totalUnfiltered > 0 && data.total <= data.listings.length;
  const found = new Set(saved.map((l) => l.dedupeKey));
  const gone = trustworthy ? ids.filter((k) => !found.has(k)) : [];
  const empty = !isLoading && saved.length === 0 && gone.length === 0;

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

        {empty && (
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

        {gone.length > 0 && (
          <div className={saved.length > 0 ? "mt-6" : ""}>
            <h2 className="wide text-[16px] font-bold text-text">No longer listed</h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {gone.map((key) => (
                <li key={key} className="flex items-center justify-between gap-4 px-5 py-4" data-testid="gone-saved">
                  <p className="text-[14px] text-muted">
                    This car is not in the latest search, so it has probably sold.
                  </p>
                  <button onClick={() => toggle(key)} className="btn btn-ghost shrink-0 py-2">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <CompareTray />
    </div>
  );
}
