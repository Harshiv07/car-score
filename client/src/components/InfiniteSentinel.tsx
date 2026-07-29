import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * The bottom of an infinite list: watches for itself coming into view, asks for
 * the next page, and says what is happening while it waits.
 *
 * Two deliberate choices.
 *
 * It loads *before* it is reached — `rootMargin` fires the request roughly a
 * screen early, so the next rows are usually already there by the time you
 * scroll to where they go. Infinite lists that wait until the sentinel is
 * actually visible always show a spinner, which is the thing that makes them
 * feel slow.
 *
 * And there is a real button underneath. An IntersectionObserver only fires for
 * someone who scrolls; a keyboard user tabbing through the list, or anyone whose
 * observer never fires, would otherwise hit a dead end with more results sitting
 * behind it. The button is the mechanism, the observer is the convenience.
 */
export function InfiniteSentinel({
  hasMore,
  isLoading,
  onLoadMore,
  remaining,
  batchSize,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  remaining: number;
  batchSize: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      // Start fetching about a viewport early rather than on arrival.
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  if (!hasMore && !isLoading) {
    return (
      <p className="py-8 text-center text-xs text-faint">That's every car matching these filters.</p>
    );
  }

  return (
    <div ref={ref} className="py-6">
      {isLoading ? (
        <div className="space-y-3" aria-live="polite" aria-busy="true">
          <span className="sr-only">Loading more cars…</span>
          {/* Skeletons the same height as a card, so the scrollbar doesn't
              lurch when the real rows replace them. */}
          {Array.from({ length: 2 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
              className="h-36 rounded-2xl bg-surface"
            />
          ))}
        </div>
      ) : (
        <div className="text-center">
          <button
            onClick={onLoadMore}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:border-brand/50 hover:text-brand"
          >
            Show {Math.min(batchSize, remaining)} more
            {remaining > batchSize ? ` of ${remaining.toLocaleString("en-CA")}` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
