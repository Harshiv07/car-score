import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPoint } from "../api/types";
import { usePrefetchListing } from "../api/hooks";
import { cad, scoreHex } from "./ui";

/**
 * The inventory as a landscape: mileage across, price up.
 *
 * A ranked list can't show the shape of the market — where the cheap-and-fresh
 * cars cluster, which ones sit well below the pack. Here the buyer's eye goes
 * to the lower-left (low km, low price) and to the spruce dots, which are the
 * high scorers. Dot colour is the same four-band scale used everywhere else.
 *
 * Hit-testing is by nearest dot in a plain loop: a few hundred points need no
 * spatial index, and one pointer listener on the SVG beats one per dot.
 */

const H = 380;
const PAD = { l: 62, r: 18, t: 16, b: 46 };
const HIT_RADIUS = 16;

/** Round steps (1, 2, 2.5, 5 × 10ⁿ) so axis labels read $20k, $40k, not $53k. */
function niceStep(max: number, target: number): number {
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const pick = [1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10;
  return pick * mag;
}

function axis(dataMax: number, target: number): { max: number; ticks: number[] } {
  const step = niceStep(Math.max(dataMax, 1), target);
  const max = Math.ceil(dataMax / step) * step || step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

const kmLabel = (v: number) => (v === 0 ? "0" : `${Math.round(v / 1000)}k`);
const priceLabel = (v: number) => (v === 0 ? "$0" : `$${Math.round(v / 1000)}k`);

export function MarketMap({ points }: { points: MapPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState<MapPoint | null>(null);
  const navigate = useNavigate();
  const prefetch = usePrefetchListing();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { xMax, yMax, xs, ys } = useMemo(() => {
    const maxKm = points.reduce((m, p) => Math.max(m, p.k), 0);
    const maxPrice = points.reduce((m, p) => Math.max(m, p.p), 0);
    const x = axis(maxKm, w < 560 ? 5 : 7);
    const y = axis(maxPrice, 4);
    return { xMax: x.max, yMax: y.max, xs: x.ticks, ys: y.ticks };
  }, [points, w]);

  const px = (k: number) => PAD.l + (k / xMax) * (w - PAD.l - PAD.r);
  const py = (p: number) => H - PAD.b - (p / yMax) * (H - PAD.t - PAD.b);

  // Best scores last, so the cars worth a look sit on top of the pile.
  const ordered = useMemo(() => [...points].sort((a, b) => a.s - b.s), [points]);

  function nearest(e: React.PointerEvent<SVGSVGElement>): MapPoint | null {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best: MapPoint | null = null;
    let bestD = HIT_RADIUS * HIT_RADIUS;
    for (const p of ordered) {
      const dx = px(p.k) - x;
      const dy = py(p.p) - y;
      const d = dx * dx + dy * dy;
      // `<=` so the later (higher-scoring) dot wins a tie.
      if (d <= bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  const tipLeft = hover ? Math.min(Math.max(px(hover.k), 110), w - 110) : 0;
  const flip = hover ? py(hover.p) < 130 : false;

  if (points.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-14 text-center">
        <p className="wide text-[20px] font-bold text-text">Nothing to plot.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          No cars with a known mileage match these filters. Widen them, or switch back to the list.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-[13px] text-muted">
          <span className="nums font-semibold text-text">{points.length.toLocaleString("en-CA")}</span> cars. Look
          bottom-left for low price and low kilometres. Green dots score highest.
        </p>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted" aria-label="Score bands">
          {[
            ["80+", 90],
            ["65 to 79", 70],
            ["50 to 64", 55],
            ["Under 50", 30],
          ].map(([label, s]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: scoreHex(s as number) }} />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div ref={wrapRef} className="relative" style={{ height: H }}>
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Scatter plot of ${points.length} cars by mileage and price. The list view has the same cars in text.`}
          className="block touch-pan-y select-none"
          onPointerMove={(e) => setHover(nearest(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const p = nearest(e);
            if (p) prefetch(p.id);
          }}
          onClick={(e) => {
            const p = nearest(e as unknown as React.PointerEvent<SVGSVGElement>);
            if (p) navigate(`/listing/${p.id}`);
          }}
          style={{ cursor: hover ? "pointer" : "default" }}
        >
          {ys.map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={w - PAD.r} y1={py(v)} y2={py(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 10} y={py(v) + 4} textAnchor="end" fontSize={11} fill="var(--faint)" className="nums">
                {priceLabel(v)}
              </text>
            </g>
          ))}
          {xs.map((v) => (
            <text key={`x${v}`} x={px(v)} y={H - PAD.b + 20} textAnchor="middle" fontSize={11} fill="var(--faint)" className="nums">
              {kmLabel(v)}
            </text>
          ))}
          <text x={(PAD.l + w - PAD.r) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--muted)">
            Odometer (km)
          </text>
          <text
            transform={`translate(14 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={12}
            fill="var(--muted)"
          >
            Asking price
          </text>

          {ordered.map((p) => (
            <circle
              key={p.id}
              cx={px(p.k)}
              cy={py(p.p)}
              r={p.s >= 80 ? 4.5 : 3.5}
              fill={scoreHex(p.s)}
              fillOpacity={hover && hover.id !== p.id ? 0.35 : 0.8}
              stroke="var(--surface)"
              strokeWidth={1}
            />
          ))}

          {hover && (
            <circle cx={px(hover.k)} cy={py(hover.p)} r={8} fill="none" stroke="var(--text)" strokeWidth={2} />
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-[210px] -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-[var(--shadow)]"
            style={{
              left: tipLeft,
              top: flip ? py(hover.p) + 16 : undefined,
              bottom: flip ? undefined : H - py(hover.p) + 16,
            }}
            role="status"
          >
            <p className="font-semibold text-text">{hover.t}</p>
            <p className="nums mt-0.5 text-muted">
              {cad(hover.p)} · {Math.round(hover.k).toLocaleString("en-CA")} km
            </p>
            <p className="mt-1 flex items-baseline justify-between gap-2">
              <span className="nums display text-[18px]" style={{ color: scoreHex(hover.s) }}>
                {hover.s}
                <span className="text-[11px] font-semibold text-faint"> /100</span>
              </span>
              <span className={`nums text-[12px] font-semibold ${hover.d <= 0 ? "text-good" : "text-bad"}`}>
                {hover.d === 0 ? "At market" : `${cad(Math.abs(hover.d))} ${hover.d < 0 ? "under" : "over"} market`}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
