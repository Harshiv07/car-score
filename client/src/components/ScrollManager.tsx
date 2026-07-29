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
 * listing don't share an offset, and `scroll-behavior: smooth` is suspended
 * while restoring — animating a 4,000px jump would be motion sickness.
 */
export function ScrollManager() {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  /** True while a restore runs, so the listener can't overwrite its target. */
  const restoring = useRef(false);

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

  useEffect(() => {
    // Sampled continuously rather than on unmount: React may unmount the old
    // route after the URL has already changed, by which point the offset is gone.
    const onScroll = () => {
      if (restoring.current) return;
      positions.current.set(key, window.scrollY);
    };

    // Captured again, synchronously, the moment a link is clicked — before the
    // router navigates and before the outgoing page can unmount. Sampling alone
    // is a frame behind; this is the offset the reader actually left from.
    const onClickCapture = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      // Same-document navigations only; an external listing opens in a new tab.
      if (!href.startsWith("/") || link.getAttribute("target") === "_blank") return;
      positions.current.set(key, window.scrollY);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [key]);

  useEffect(() => {
    const target = navigationType === "POP" ? (positions.current.get(key) ?? 0) : 0;
    restoring.current = true;

    const root = document.documentElement;
    const prior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";

    const done = () => {
      root.style.scrollBehavior = prior;
      // A frame later, so the scroll we just issued isn't taken for a user one.
      requestAnimationFrame(() => {
        restoring.current = false;
      });
    };

    if (target === 0) {
      window.scrollTo(0, 0);
      done();
      return;
    }

    // Wait for the page to be tall enough before restoring.
    //
    // Two animation frames is enough for a fixed-length page and not enough for
    // an infinite one: React Query restores every loaded page from cache, and
    // `AnimatePresence mode="wait"` holds the outgoing route until its exit
    // animation finishes, so for a few hundred milliseconds the document is only
    // as tall as the header. Restoring into that gap silently clamps to the top.
    // Poll for the height instead, and give up after a window long enough to
    // cover both rather than fighting a page that is genuinely shorter now — a
    // filter changed, listings sold.
    let raf = 0;
    const deadline = performance.now() + 2500;
    const tryRestore = () => {
      const reachable = document.documentElement.scrollHeight - window.innerHeight;
      if (reachable >= target || performance.now() > deadline) {
        window.scrollTo(0, Math.min(target, Math.max(0, reachable)));
        done();
        return;
      }
      raf = requestAnimationFrame(tryRestore);
    };
    raf = requestAnimationFrame(tryRestore);

    return () => {
      cancelAnimationFrame(raf);
      root.style.scrollBehavior = prior;
      restoring.current = false;
    };
  }, [key, pathname, navigationType]);

  return null;
}
