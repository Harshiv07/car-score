import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useListings } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { ListingCard } from "../components/ListingCard";
import { CompareTray } from "../components/CompareTray";

/**
 * Saved cars.
 *
 * Looked up by dedupeKey server-side. The previous version fetched the first
 * 100 listings by score and filtered them client side, so anything saved from
 * further down the leaderboard never appeared — and the prune step then treated
 * "not in the top 100" as "no longer listed" and deleted it.
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

  // Anything we asked for by key and didn't get back is genuinely gone from the
  // inventory — that's a safe signal to prune, unlike a ranked page.
  useEffect(() => {
    if (!data || ids.length === 0) return;
    prune(data.listings.map((l) => l.dedupeKey));
  }, [data, ids.length, prune]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-text">Saved cars</h1>
      <p className="mt-1.5 text-sm text-muted">
        Kept in this browser — no account needed.{saved.length > 0 ? ` ${saved.length} saved.` : ""}
      </p>

      <div className="mt-6 space-y-3">
        {isLoading && ids.length > 0 && (
          <div className="space-y-3">
            {Array.from({ length: Math.min(3, ids.length) }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        )}

        {!isLoading && saved.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-12 text-center">
            <p className="text-4xl text-bad" aria-hidden>
              ♡
            </p>
            <p className="mt-3 font-display font-bold text-text">Nothing saved yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Tap the heart on any car to keep it here while you shop around.
            </p>
            <Link
              to="/"
              className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold transition hover:bg-brand-strong"
              style={{ color: "var(--on-brand)" }}
            >
              Browse the leaderboard
            </Link>
          </div>
        )}

        {saved.map((l, i) => (
          <motion.div
            key={l.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(i * 0.04, 0.28), ease: [0.4, 0, 0.2, 1] }}
          >
            <ListingCard listing={l} />
          </motion.div>
        ))}
      </div>

      <CompareTray />
    </div>
  );
}
