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
