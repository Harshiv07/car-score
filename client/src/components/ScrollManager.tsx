import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Scroll position across navigations.
 *
 * There was none. Click the ninth car on the leaderboard and the detail page
 * opened already scrolled halfway down, because the window kept whatever offset
 * the previous page had; press Back and you landed at the top of the list
 * rather than beside the car you just looked at. Browsing a ranked list is
 * exactly the flow where that hurts most — you lose your place on every hop.
 *
 * The rule is the one browsers use for documents:
 *   - a new navigation (PUSH/REPLACE) starts at the top,
 *   - going Back or Forward (POP) restores where you were.
 *
 * Positions are keyed by history entry, not by path, so two visits to the same
 * listing don't share an offset. `scroll-behavior: smooth` is suspended while
 * restoring — animating a 3,000px jump would be motion sickness, not polish.
 */
export function ScrollManager() {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previous = useRef<{ key: string } | null>(null);

  // Take the browser's own restoration out of the loop — with a client-side
  // router it fires against the wrong document height and fights this.
  useEffect(() => {
    if ("scrollRestoration" in history) {
      const prior = history.scrollRestoration;
      history.scrollRestoration = "manual";
      return () => {
        history.scrollRestoration = prior;
      };
    }
  }, []);

  // Record continuously rather than on unmount: React may unmount the old route
  // after the URL has already changed, by which point the offset is gone.
  useEffect(() => {
    const onScroll = () => {
      positions.current.set(key, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key]);

  useEffect(() => {
    const target = navigationType === "POP" ? (positions.current.get(key) ?? 0) : 0;
    previous.current = { key };

    const root = document.documentElement;
    const prior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";

    // Two frames: one for the route to commit, one for its content to lay out.
    // Restoring before the page has height silently clamps to 0.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.scrollTo(0, target);
        root.style.scrollBehavior = prior;
      })
    );
    return () => cancelAnimationFrame(raf);
  }, [key, pathname, navigationType]);

  return null;
}
