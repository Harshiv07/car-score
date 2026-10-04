import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/motion";

/**
 * A number that counts up to its value once, on mount.
 *
 * The DOM always holds the true value first — the tween writes over it — so a
 * tween that never runs (reduced motion, a throttled tab) still leaves the
 * real score on screen. A wrong number is far worse than a missing animation.
 */
export function CountUp({
  value,
  duration = 1,
  delay = 0,
  className,
  style,
}: {
  value: number;
  duration?: number;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const n = Math.round(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const o = { v: 0 };
    const tween = gsap.to(o, {
      v: n,
      duration,
      delay,
      ease: "power3.out",
      onUpdate: () => (el.textContent = String(Math.round(o.v))),
      onComplete: () => (el.textContent = String(n)),
    });
    el.textContent = "0";
    return () => {
      tween.kill();
      el.textContent = String(n);
    };
  }, [n, duration, delay]);

  return (
    <span ref={ref} className={className} style={style}>
      {n}
    </span>
  );
}

/**
 * A horizontal bar filled to `percent`, used for running costs. Fills on the
 * next frame after mount via a CSS transition — deterministic, never left empty.
 */
export function FillBar({
  percent,
  color = "var(--text)",
  delay = 0,
  height = 6,
}: {
  percent: number;
  color?: string;
  delay?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.width = `${target}%`;
      return;
    }
    const id = requestAnimationFrame(() => (el.style.width = `${target}%`));
    return () => cancelAnimationFrame(id);
  }, [target]);

  return (
    <div className="overflow-hidden rounded-full bg-line" style={{ height }} role="presentation">
      <div
        ref={ref}
        className="h-full rounded-full"
        style={{ width: 0, backgroundColor: color, transition: `width 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s` }}
      />
    </div>
  );
}
