/** Shared UI atoms: score badge, pills, badges, stars, segmented, toggle, select, fmt. */

import { useEffect, useRef, useState } from "react";
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

/**
 * Score colour bands. Four steps, and they read the same way everywhere in the
 * app: green is earned, gold is the middle, red is a warning. Gold doubles as
 * the brand colour, which is deliberate — a mid-70s score is the honest
 * default for most of this inventory.
 */
export function scoreHex(total: number): string {
  if (total >= 80) return "var(--good)";
  if (total >= 65) return "var(--brand-strong)";
  if (total >= 50) return "var(--warn)";
  return "var(--bad)";
}

/** Tailwind text class (token-based) for score numbers elsewhere. */
export function scoreColor(total: number): string {
  if (total >= 80) return "text-good";
  if (total >= 65) return "text-brand";
  if (total >= 50) return "text-warn";
  return "text-bad";
}

/* ---- score spine --------------------------------------------------------- */

/**
 * The leaderboard's signature element.
 *
 * A vertical rail down the left edge of every card, filled to the car's score
 * in its band colour, with the numeral at the top and the rank beneath. Read a
 * single card and it's a score; scroll the list and the cards themselves draw a
 * bar chart of quality down the page, so "this one is clearly better than the
 * three under it" is legible without reading a word.
 */
export function ScoreSpine({ total, rank }: { total: number; rank?: number }) {
  const hex = scoreHex(total);
  const n = Math.round(total);
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1.5 self-stretch sm:w-11">
      {rank != null && (
        <span className="nums text-[11px] font-bold text-faint" aria-hidden>
          #{rank}
        </span>
      )}

      <div className="flex flex-col items-center leading-none">
        <span className="nums font-display text-[26px] font-extrabold sm:text-[30px]" style={{ color: hex }}>
          {n}
        </span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-faint">/100</span>
      </div>

      {/* The rail. The unfilled track stays visible so the proportion reads —
          at 87/100 a track-coloured remainder is the only thing distinguishing
          it from a solid bar. aria-hidden: the numeral already announces it. */}
      <div
        className="relative w-1.5 flex-1 overflow-hidden rounded-full ring-1 ring-inset ring-line"
        style={{ backgroundColor: "color-mix(in oklab, var(--line) 60%, transparent)" }}
        aria-hidden
      >
        <div
          className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500"
          style={{ height: `${Math.max(4, Math.min(100, n))}%`, backgroundColor: hex }}
        />
      </div>
    </div>
  );
}

/* ---- score badge --------------------------------------------------------- */

/** Compact score tile, for places without room for the spine (detail hero,
 *  compare tray, alternatives). Big number in the band colour on a tinted tile. */
export function ScoreBadge({ total, variant = "card" }: { total: number; variant?: "card" | "hero" }) {
  const hex = scoreHex(total);
  const hero = variant === "hero";
  const n = Math.round(total);
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-2xl ${hero ? "h-24 w-24" : "h-14 w-14"}`}
      style={{
        backgroundColor: `color-mix(in oklab, ${hex} 13%, var(--surface) 30%)`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${hex} 40%, transparent)`,
      }}
      aria-label={`Score ${n} out of 100`}
      title={`CarScore ${n} / 100`}
    >
      <span className="nums font-display font-bold" style={{ color: hex, fontSize: hero ? 42 : 22, lineHeight: 1 }}>
        {n}
      </span>
      <span
        className="font-semibold uppercase text-faint"
        style={{ fontSize: hero ? 10 : 7.5, letterSpacing: "0.1em", marginTop: hero ? 5 : 3, lineHeight: 1 }}
      >
        /100
      </span>
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
  "Above Market": "bg-warn/12 text-warn ring-warn/25",
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
    <div role="group" aria-label={ariaLabel} className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-surface2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2 py-1.5 text-xs font-semibold transition ${
              active ? "bg-brand shadow-sm" : "text-muted hover:text-text"
            }`}
            style={active ? { color: "var(--on-brand)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/**
 * Fully-themed dropdown (native <select> option lists can't be styled and look
 * broken in dark mode). Button + popover list, closes on outside-click/Escape.
 */
export function Select({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface2 px-3 py-2 text-sm font-medium text-text transition hover:border-line-strong"
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <span className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface p-1 shadow-xl shadow-black/30"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition ${
                    active ? "bg-brand/15 font-semibold text-brand" : "text-text hover:bg-surface2"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <span className="text-brand">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * A single hard fact on a card — value first, then its unit/label. Keeping the
 * value at text weight and the label faint lets someone scan a column of cards
 * for "km" or "AWD" without reading sentences.
 */
export function Fact({ value, label }: { value: string; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="nums font-semibold text-text">{value}</span>
      {label && <span className="text-faint">{label}</span>}
    </span>
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
