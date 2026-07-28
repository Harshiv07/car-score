import { Link } from "react-router-dom";
import { useCompare, MAX_COMPARE } from "../hooks/useCompare";

/**
 * The comparison tray: a docked bar showing what's queued for side-by-side
 * review. It only exists once something is in it, so it costs nothing until
 * it's useful, and it never covers the last card (the results list reserves
 * space via the padding below).
 */
export function CompareTray() {
  const { ids, count, clear } = useCompare();
  if (count === 0) return null;

  return (
    <>
      {/* Keeps the tray from sitting on top of the final listing. */}
      <div className="h-24" aria-hidden />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="nums font-display text-lg font-extrabold text-brand">{count}</span>
            <span className="text-sm text-muted">
              of {MAX_COMPARE} selected
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={clear}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:text-text"
            >
              Clear
            </button>
            <Link
              to={`/compare?ids=${ids.join(",")}`}
              aria-disabled={count < 2}
              onClick={(e) => count < 2 && e.preventDefault()}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                count < 2
                  ? "cursor-not-allowed bg-surface2 text-faint"
                  : "bg-brand hover:bg-brand-strong"
              }`}
              style={count < 2 ? undefined : { color: "var(--on-brand)" }}
            >
              {count < 2 ? "Pick one more to compare" : `Compare ${count} cars`}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
