import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

/**
 * Shared motion primitives.
 *
 * The rule this file follows: motion earns its place by explaining something.
 * A score counting up and a bar filling are the app *showing its work* — the
 * number was measured, the total is composed of parts. Decoration that doesn't
 * carry meaning is left out, because a page where everything moves reads as
 * noise and hides the two or three things that should.
 *
 * `MotionConfig reducedMotion="user"` (main.tsx) covers transform and layout
 * animations automatically, but it does not cover animated *values* like a
 * counting number or a width. Everything here checks `useReducedMotion()` and
 * snaps to the final state instead.
 */

/** Shared easing so unrelated components still feel like one system. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const SPRING = { type: "spring", stiffness: 380, damping: 32 } as const;

/**
 * A number that counts to its value the first time it scrolls into view.
 *
 * Used for scores. A CarScore is the product's whole claim, and watching it
 * settle reads as a measurement being taken rather than a figure being asserted.
 */
export function AnimatedNumber({
  value,
  duration = 0.9,
  className,
  style,
}: {
  value: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);

  // Starts from the real value and animates on mount, so if anything goes wrong
  // the number on screen is still the true score. Triggering on scroll-into-view
  // risked rendering a permanent "0" if the observer never fired — a wrong
  // number is far worse than a missing animation.
  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    setShown(0);
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setShown(v),
      onComplete: () => setShown(value),
    });
    return () => {
      controls.stop();
      setShown(value);
    };
  }, [value, duration, reduced]);

  return (
    <span className={className} style={style}>
      {Math.round(shown)}
    </span>
  );
}

/**
 * Fires once on mount, on the next frame, so a CSS transition has a 0% frame to
 * animate away from.
 *
 * Deliberately not `useInView`. These bars *are* the data — a rail that never
 * fills is a score the reader cannot see — and an IntersectionObserver that
 * misses is a silent correctness bug rather than a missing flourish. Observed
 * exactly that: one card in a fully rendered page measured a 0px rail because
 * its observer never fired. Mount is deterministic, and the `delay` prop
 * supplies the stagger that scroll-triggering was there to provide.
 */
function useFillOnMount(): boolean {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return filled;
}

/**
 * A horizontal bar that fills to `percent`.
 *
 * On the detail page these are the score breakdown — ten bars filling in
 * sequence is the total visibly assembling from its categories, which is the
 * one thing that page exists to explain.
 */
export function FillBar({
  percent,
  className = "",
  trackClassName = "",
  delay = 0,
  height = 6,
}: {
  percent: number;
  className?: string;
  trackClassName?: string;
  delay?: number;
  height?: number;
}) {
  const filled = useFillOnMount();
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(100, percent));

  return (
    <div
      className={`overflow-hidden rounded-full bg-surface2 ${trackClassName}`}
      style={{ height }}
      role="presentation"
    >
      <div
        className={`h-full rounded-full ${className}`}
        style={{
          width: reduced || filled ? `${target}%` : "0%",
          transition: reduced
            ? "none"
            : `width 0.75s cubic-bezier(${EASE.join(",")}) ${delay}s`,
        }}
      />
    </div>
  );
}

/**
 * Vertical variant, for the leaderboard's score spine. Fills from the bottom so
 * a column of cards draws itself as a bar chart as the page settles.
 */
export function FillRail({ percent, color }: { percent: number; color: string }) {
  const filled = useFillOnMount();
  const reduced = useReducedMotion();
  const target = Math.max(4, Math.min(100, percent));

  return (
    <div
      className="relative w-1.5 flex-1 overflow-hidden rounded-full ring-1 ring-inset ring-line"
      style={{ backgroundColor: "color-mix(in oklab, var(--line) 60%, transparent)" }}
      aria-hidden
    >
      <div
        className="absolute inset-x-0 bottom-0 rounded-full"
        style={{
          height: reduced || filled ? `${target}%` : "0%",
          backgroundColor: color,
          transition: reduced ? "none" : `height 0.7s cubic-bezier(${EASE.join(",")})`,
        }}
      />
    </div>
  );
}
