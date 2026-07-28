import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useCompare, MAX_COMPARE } from "../hooks/useCompare";
import { SPRING } from "./motion";

/**
 * The comparison tray: a docked bar showing what is queued for side-by-side
 * review. It only exists once something is in it, so it costs nothing until it
 * is useful, and it never covers the last card — the spacer below reserves room.
 *
 * It slides up rather than appearing, because it arrives in response to a click
 * somewhere else on the page: the movement is what connects the ⇄ you pressed to
 * the bar that showed up at the bottom of the screen.
 */
export function CompareTray() {
  const { ids, count, clear } = useCompare();

  return (
    <AnimatePresence>
      {count > 0 && (
        <>
          {/* Keeps the tray from sitting on top of the final listing. */}
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 96 }}
            exit={{ height: 0 }}
            transition={SPRING}
            aria-hidden
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                {/* The count is the one thing that changes as you pick cars, so
                    it gets a small pop to confirm the click registered. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="nums font-display text-lg font-extrabold text-brand"
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
                <span className="text-sm text-muted">of {MAX_COMPARE} selected</span>
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
                    count < 2 ? "cursor-not-allowed bg-surface2 text-faint" : "bg-brand hover:bg-brand-strong"
                  }`}
                  style={count < 2 ? undefined : { color: "var(--on-brand)" }}
                >
                  {count < 2 ? "Pick one more to compare" : `Compare ${count} cars`}
                </Link>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
