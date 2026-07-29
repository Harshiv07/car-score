import { useState } from "react";

/**
 * Vehicle photo with a real responsive srcset, a loading skeleton and a
 * graceful fallback.
 *
 * Why the URL rewriting: the AutoTrader/AutoScout CDN encodes the render size
 * as the last path segment (`…/<uuid>.jpg/250x188.webp`) and will serve any
 * size we ask for. The scraper stores the 250x188 thumbnail, which looks soft
 * the moment it's shown larger than a chip — so we re-point the same asset at
 * the width each slot actually needs instead of upscaling a thumbnail.
 * Non-matching URLs (dealer sites, Wikimedia) are passed through untouched.
 */

const SIZED_CDN = /^(https:\/\/[^/]*(?:autoscout24|autotrader)[^/]*\/.+\.(?:jpg|jpeg|png))\/\d+x\d+\.(webp|jpg|jpeg|png)$/i;

/** Widths we offer the browser; heights follow the CDN's 4:3 source ratio. */
const WIDTHS = [250, 480, 640, 800, 1024];

function sizedUrl(url: string, width: number): string | null {
  const m = url.match(SIZED_CDN);
  if (!m) return null;
  return `${m[1]}/${width}x${Math.round((width * 3) / 4)}.${m[2]}`;
}

function buildSrcSet(url: string): string | undefined {
  if (!SIZED_CDN.test(url)) return undefined;
  return WIDTHS.map((w) => `${sizedUrl(url, w)} ${w}w`).join(", ");
}

/** Pass `null` to set the aspect ratio from `className` instead (e.g. when it
 *  needs to change at a breakpoint: `aspect-[16/9] sm:aspect-[4/3]`). */
export type PhotoRatio = "16/9" | "4/3" | "3/2" | null;

export function CarPhoto({
  src,
  alt,
  ratio = "4/3",
  sizes = "(max-width: 640px) 100vw, 320px",
  /** Preferred single-width fallback for browsers ignoring srcset. */
  width = 640,
  className = "",
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  ratio?: PhotoRatio;
  sizes?: string;
  width?: number;
  className?: string;
  priority?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(src ? "loading" : "failed");

  const resolved = src ? sizedUrl(src, width) ?? src : null;
  const srcSet = src ? buildSrcSet(src) : undefined;

  return (
    <div
      className={`relative overflow-hidden bg-surface2 ${className}`}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {state === "loading" && <div className="absolute inset-0 shimmer" aria-hidden />}

      {resolved && state !== "failed" && (
        <img
          src={resolved}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          // Lowercase: React 18 does not map `fetchPriority` to the DOM
          // attribute and warns about an unrecognised prop.
          {...{ fetchpriority: priority ? "high" : "auto" }}
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            state === "ready" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {state === "failed" && <NoPhoto />}
    </div>
  );
}

/** Shown when a listing has no photo, or the dealer's CDN drops it. */
function NoPhoto() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-surface2" role="img" aria-label="No photo available">
      <div className="flex flex-col items-center gap-1.5 text-faint">
        <CarGlyph />
        <span className="text-[10px] font-semibold uppercase tracking-wider">No photo</span>
      </div>
    </div>
  );
}

function CarGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 13.5h18M5.5 13.5 7 8.2A2 2 0 0 1 8.9 6.8h6.2A2 2 0 0 1 17 8.2l1.5 5.3" strokeLinecap="round" />
      <rect x="3" y="13.5" width="18" height="4.2" rx="1.4" />
      <circle cx="7.2" cy="17.7" r="1.5" />
      <circle cx="16.8" cy="17.7" r="1.5" />
    </svg>
  );
}
