import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";

/**
 * GSAP, registered once.
 *
 * Motion in this app follows one rule: it either explains something or it
 * answers something you did. A score counting up and its composition strip
 * filling are the app showing its work; a car turning to face the inspection
 * point you chose is an answer. Each page gets at most one unprompted
 * sequence, on first arrival. Nothing fades up as you scroll.
 */
gsap.registerPlugin(useGSAP, SplitText);

// ScrollTrigger is registered by the guide, the only page that uses it, so it
// stays out of the main bundle.
export { gsap, useGSAP, SplitText };

export const EASE_OUT = "power3.out";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Page intros play once per visit, not every time you come back to a page.
 * Returning to the leaderboard from a listing should land you where you were,
 * not replay an entrance.
 */
const played = new Set<string>();

/** Pure, so it's safe in a state initializer (StrictMode calls those twice). */
export function hasPlayed(key: string): boolean {
  return played.has(key);
}

/** Call from an effect once the intro has been handed to the page. */
export function markPlayed(key: string): void {
  played.add(key);
}
