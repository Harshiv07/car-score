import { useCallback, useRef } from "react";

/**
 * Feeds the pointer position to CSS as `--mx/--my` (a spotlight that follows the
 * cursor) and, optionally, `--rx/--ry` (a few degrees of tilt toward it).
 *
 * Only the CSS custom properties change — no React state, no re-render — and
 * writes are coalesced to one per frame. Does nothing for touch/pen input, which
 * has no hover to follow, or when the user has asked for reduced motion.
 */
export function usePointerLight<T extends HTMLElement>(tiltDeg = 0) {
  const raf = useRef(0);
  const reduced = useRef<boolean | null>(null);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      if (e.pointerType !== "mouse") return;
      if (reduced.current === null) {
        reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
      const el = e.currentTarget;
      const { clientX, clientY } = e;
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        const r = el.getBoundingClientRect();
        const px = (clientX - r.left) / r.width;
        const py = (clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        if (tiltDeg && !reduced.current) {
          el.style.setProperty("--ry", `${((px - 0.5) * 2 * tiltDeg).toFixed(2)}deg`);
          el.style.setProperty("--rx", `${((0.5 - py) * 2 * tiltDeg).toFixed(2)}deg`);
        }
      });
    },
    [tiltDeg]
  );

  const onPointerLeave = useCallback((e: React.PointerEvent<T>) => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    const el = e.currentTarget;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  }, []);

  return { onPointerMove, onPointerLeave };
}
