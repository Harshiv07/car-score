/** Shared UI atoms: score gauge, pills, badges, stars, segmented, toggle, fmt. */

import { DealRating } from "../api/types";

export const cad = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
export const km = (n: number) => `${Math.round(n).toLocaleString("en-CA")} km`;

/** Coarse relative time for "added / last seen" timestamps. */
export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function isRecent(iso: string, hours = 48): boolean {
  return Date.now() - new Date(iso).getTime() < hours * 3600 * 1000;
}

/* ---- score colour bands -------------------------------------------------- */

/** Hex for the gauge arc/needle (gradient-friendly). */
export function scoreHex(total: number): string {
  if (total >= 80) return "#34d399"; // emerald
  if (total >= 65) return "#a3e635"; // lime
  if (total >= 50) return "#f9a825"; // amber
  return "#fb7185"; // rose
}

/** Tailwind text class (token-based) for score numbers elsewhere. */
export function scoreColor(total: number): string {
  if (total >= 80) return "text-good";
  if (total >= 65) return "text-good";
  if (total >= 50) return "text-brand";
  return "text-bad";
}

/* ---- score gauge (semicircle + needle) ----------------------------------- */

export function ScoreGauge({ total, size = 64 }: { total: number; size?: number }) {
  const pct = Math.min(100, Math.max(0, total)) / 100;
  const hex = scoreHex(total);
  const r = 42;
  const cx = 50;
  const cy = 50;
  const arcLen = Math.PI * r;
  // Needle angle: pct 0 → 180° (left), pct 1 → 0° (right).
  const theta = Math.PI - pct * Math.PI;
  const nx = cx + (r - 6) * Math.cos(theta);
  const ny = cy - (r - 6) * Math.sin(theta);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.72 }}>
      <svg viewBox="0 0 100 62" className="h-full w-full overflow-visible">
        {/* track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* value arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={hex}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${pct * arcLen} ${arcLen}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        {/* needle + hub */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4.5" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />
      </svg>
      <div
        className="nums absolute inset-x-0 bottom-0 text-center font-extrabold leading-none"
        style={{ color: hex, fontSize: size * 0.34 }}
      >
        {Math.round(total)}
      </div>
    </div>
  );
}

/* ---- pills, badges, stars ------------------------------------------------ */

export function NewBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info ring-1 ring-info/25">
      <span className="h-1.5 w-1.5 rounded-full bg-info" />
      New
    </span>
  );
}

export function Stars({ value, className = "" }: { value: number; className?: string }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className={`tracking-tight text-brand ${className}`} title={`${value}/5`}>
      {"★".repeat(full)}
      {half ? "⯨" : ""}
      <span className="text-line-strong">{"★".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}</span>
    </span>
  );
}

const DEAL_STYLES: Record<DealRating, string> = {
  "Excellent Deal": "bg-good/15 text-good ring-good/30",
  "Great Deal": "bg-good/12 text-good ring-good/25",
  "Good Deal": "bg-info/12 text-info ring-info/25",
  "Fair Price": "bg-muted/12 text-muted ring-line-strong/40",
  "Above Market": "bg-brand/12 text-brand ring-brand/25",
  Overpriced: "bg-bad/12 text-bad ring-bad/30",
};

export function DealPill({ rating }: { rating: DealRating }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${DEAL_STYLES[rating]}`}
    >
      {rating}
    </span>
  );
}

const BADGE_STYLES: Record<string, string> = {
  "Excellent Deal": "bg-good/12 text-good ring-good/25",
  "Best Reliability": "bg-info/12 text-info ring-info/25",
  "Best Winter": "bg-cool/12 text-cool ring-cool/25",
  "Lowest Mileage": "bg-cool/12 text-cool ring-cool/25",
  "Best Resale": "bg-brand/12 text-brand ring-brand/25",
  CPO: "bg-good/12 text-good ring-good/25",
};

export function Badge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${
        BADGE_STYLES[label] ?? "bg-raised text-muted ring-line"
      }`}
    >
      {label}
    </span>
  );
}

/* ---- form controls ------------------------------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
              active ? "bg-brand text-black shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-text">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-line-strong"
        }`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          }`}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </label>
  );
}
