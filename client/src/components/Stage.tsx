import { Component, lazy, ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { CarStageProps } from "../three/CarStage";

/**
 * Loads the 3D studio on demand and falls back to `fallback` wherever it
 * can't run: no WebGL, a lost context, or a failed chunk. three.js never
 * touches the main bundle, and a browser without WebGL still gets a car.
 */
const CarStage = lazy(() => import("../three/CarStage"));

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function Stage({ fallback, ...props }: Omit<CarStageProps, "onUnsupported"> & { fallback: ReactNode }) {
  const supported = useMemo(webglAvailable, []);
  const [failed, setFailed] = useState(false);
  const onUnsupported = useCallback(() => setFailed(true), []);

  if (!supported || failed) return <>{fallback}</>;

  return (
    <StageBoundary fallback={fallback}>
      <Suspense fallback={<div className={props.className} aria-hidden />}>
        <CarStage {...props} onUnsupported={onUnsupported} />
      </Suspense>
    </StageBoundary>
  );
}

/** A chunk that fails to load (offline, a stale deploy) shows the flat car, not a blank. */
class StageBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The same two silhouettes, flat, for when there is no 3D. */
export function CarSilhouette({ suv = false, className = "" }: { suv?: boolean; className?: string }) {
  const body = suv
    ? "M30 150 L32 112 Q36 98 56 96 L118 90 L160 52 Q170 44 186 44 L330 44 Q350 46 358 62 L372 104 Q384 110 384 126 L384 150 Z"
    : "M24 150 L28 118 Q34 104 56 100 L132 92 Q166 64 214 62 Q262 62 290 86 L352 96 Q378 102 380 124 L380 150 Z";
  const glass = suv
    ? "M128 92 L166 58 Q172 52 184 52 L326 52 Q340 54 346 66 L356 92 Z"
    : "M146 92 Q172 70 212 70 Q252 70 278 92 Z";
  return (
    <svg
      viewBox="0 0 400 190"
      className={className}
      role="img"
      aria-label={suv ? "SUV silhouette" : "Sedan silhouette"}
    >
      <ellipse cx="200" cy="166" rx="190" ry="10" fill="var(--text)" opacity="0.08" />
      <path d={body} fill="var(--paint)" />
      <path d={glass} fill="var(--text)" opacity="0.85" />
      {[100, 300].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="150" r="26" fill="var(--text)" />
          <circle cx={cx} cy="150" r="13" fill="var(--line-strong)" />
        </g>
      ))}
    </svg>
  );
}

/**
 * The car's paint, read from the `--paint` token so it follows the theme.
 * three.js needs a real colour, not a CSS variable, so this re-reads whenever
 * the root's class list changes (the theme switch).
 */
export function usePaint(token = "--paint"): string {
  const read = () => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#e9581b";
  const [paint, setPaint] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setPaint(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return paint;
}
