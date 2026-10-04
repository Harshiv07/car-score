import { useRef } from "react";
import { ScoreCategory } from "../api/types";
import { gsap, useGSAP, prefersReducedMotion } from "../lib/motion";

/**
 * The composition strip — CarScore's signature.
 *
 * A score out of 100 is ten categories added up, so the strip is drawn as
 * exactly that: ten segments, each as wide as the points it's worth
 * (reliability and market value 20 each, down to features at 2), each filled
 * as far as the car earned. Read across, it says where the points came from;
 * the gaps say where they were lost. A category below half its points is
 * filled in brake-light red, because the weak spot is usually the story.
 *
 * On rows it's static. On the hero and the scorecard it fills left to right,
 * once, as the total is shown — the score visibly assembling from its parts.
 */
export function ScoreStrip({
  breakdown,
  size = "sm",
  animate = false,
  className = "",
}: {
  breakdown: ScoreCategory[];
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cats = breakdown.filter((c) => c.max > 0);

  useGSAP(
    () => {
      if (!animate || prefersReducedMotion()) return;
      gsap.from(ref.current!.querySelectorAll("[data-fill]"), {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.55,
        ease: "power2.out",
        stagger: 0.07,
        delay: 0.15,
      });
    },
    { scope: ref, dependencies: [animate] },
  );

  const h = size === "lg" ? 16 : size === "md" ? 10 : 7;
  const summary = cats.map((c) => `${c.label} ${round(c.points)} of ${c.max}`).join(", ");

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Score breakdown: ${summary}`}
      className={`flex w-full gap-[2px] ${className}`}
      style={{ height: h }}
    >
      {cats.map((c) => {
        const frac = Math.max(0, Math.min(1, c.points / c.max));
        const weak = frac < 0.5;
        return (
          <span
            key={c.key}
            title={`${c.label}: ${round(c.points)} of ${c.max}`}
            className="relative h-full overflow-hidden first:rounded-l-[3px] last:rounded-r-[3px]"
            style={{ flexGrow: c.max, flexBasis: 0, backgroundColor: "var(--line)" }}
          >
            <span
              data-fill
              className="absolute inset-y-0 left-0"
              style={{ width: `${frac * 100}%`, backgroundColor: weak ? "var(--bad)" : "var(--text)" }}
            />
          </span>
        );
      })}
    </div>
  );
}

export const round = (n: number) => (Math.round(n * 10) / 10).toString();
