import { Link } from "react-router-dom";
import { useCompare, MAX_COMPARE } from "../hooks/useCompare";
import { usePresence } from "../hooks/usePresence";

/**
 * The comparison tray: docked to the bottom once something is queued, in
 * inverted ink so it reads as a different layer from the list. It slides up
 * because it arrives in response to a click elsewhere — the movement connects
 * the button you pressed to the bar that appeared.
 */
export function CompareTray() {
  const { ids, count, clear } = useCompare();
  const p = usePresence(count > 0, 320);

  return (
    <>
      {/* Keeps the tray from sitting on top of the last row. */}
      {count > 0 && <div className="h-24" aria-hidden />}
      {p.mounted && (
        <div
          data-state={p.state}
          data-side="bottom"
          className="sheet fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-5"
        >
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-text px-4 py-3 text-bg shadow-[var(--shadow)] sm:px-5">
            <div className="flex items-center gap-3">
              <span className="flex gap-1" aria-hidden>
                {Array.from({ length: MAX_COMPARE }).map((_, i) => (
                  <span
                    key={i}
                    className="h-2.5 w-6 rounded-sm transition-colors"
                    style={{ backgroundColor: i < count ? "var(--accent)" : "color-mix(in oklab, var(--bg) 25%, transparent)" }}
                  />
                ))}
              </span>
              <span className="text-sm font-semibold" aria-live="polite">
                <span className="nums">{count}</span> of {MAX_COMPARE} picked to compare
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={clear} className="rounded-lg px-3 py-2 text-sm font-semibold opacity-75 transition-opacity hover:opacity-100">
                Clear
              </button>
              <Link
                to={`/compare?ids=${ids.join(",")}`}
                aria-disabled={count < 2}
                onClick={(e) => count < 2 && e.preventDefault()}
                className={`btn py-2 ${count < 2 ? "cursor-not-allowed opacity-50" : ""}`}
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              >
                {count < 2 ? "Pick one more" : `Compare ${count} cars`}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
