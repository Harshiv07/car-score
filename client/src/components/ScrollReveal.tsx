import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "./motion";

/**
 * Reveals its child as it scrolls into view.
 *
 * Applied to listing cards, so moving down the leaderboard feels like the list
 * is arriving rather than already being there. Deliberately a small movement —
 * a short rise and a fade, once per card — because a long list amplifies
 * anything showy into noise by the twentieth row.
 *
 * **It cannot leave content hidden.** The score rails and count-ups elsewhere in
 * this app were moved off scroll-triggering precisely because a missed
 * IntersectionObserver left a card with a 0px rail — an invisible score. A
 * reveal has the same failure mode, and worse: a whole card that never appears.
 * So the observer is the fast path, not the only path — a timer forces the
 * final state regardless, and anything already on screen at mount is shown
 * immediately rather than waiting for a callback.
 *
 * Reduced motion skips it entirely and renders the card in place.
 */
export function ScrollReveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    // Already in view on first paint (the top of the list): show at once, so
    // the first screen isn't animating in from nothing.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      // Start a little before the card's edge so it is settled by the time it
      // is properly on screen.
      { rootMargin: "0px 0px -40px 0px", threshold: 0.01 }
    );
    io.observe(el);

    // The safeguard: whatever the observer does or doesn't do, the card is
    // visible shortly. A reveal that can strand content is a bug, not an effect.
    const failsafe = setTimeout(() => setShown(true), 1200);

    return () => {
      io.disconnect();
      clearTimeout(failsafe);
    };
  }, [reduced]);

  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
      transition={{ duration: 0.42, delay: shown ? delay : 0, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
