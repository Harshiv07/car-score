import { lazy, ReactNode, Suspense, useCallback, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ScoreCategory } from "../api/types";

/**
 * Loads the 3D ring on demand and falls back to `children` — the plain-text
 * breakdown — anywhere it can't run. three.js is ~500 kB; the main bundle never
 * sees it, and a visitor whose browser has no WebGL still gets every number.
 */
const ScoreRing3D = lazy(() => import("./ScoreRing3D"));

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function ScoreRing({
  breakdown,
  fallback,
  className = "",
}: {
  breakdown: ScoreCategory[];
  fallback: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const supported = useMemo(webglAvailable, []);
  const [failed, setFailed] = useState(false);
  const onUnsupported = useCallback(() => setFailed(true), []);

  if (!supported || failed) return <>{fallback}</>;

  return (
    <Suspense fallback={<div className={`shimmer rounded-2xl ${className}`} aria-hidden />}>
      <ScoreRing3D breakdown={breakdown} onUnsupported={onUnsupported} reducedMotion={reduced} className={className} />
    </Suspense>
  );
}
