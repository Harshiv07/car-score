import { useEffect, useState } from "react";

/**
 * Keeps an overlay mounted long enough to animate out.
 *
 * `mounted` follows `open` immediately on the way in and `exitMs` later on the
 * way out; `state` flips a frame after mounting so a CSS transition has a
 * closed frame to start from. Style off `[data-state]` (see index.css).
 */
export function usePresence(open: boolean, exitMs = 320) {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<"open" | "closed">(open ? "open" : "closed");

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setState("open")));
      return () => cancelAnimationFrame(id);
    }
    setState("closed");
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted, state };
}
