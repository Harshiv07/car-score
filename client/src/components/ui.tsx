/** Shared UI atoms: formatting, score bands, tags, and the form controls. */

import { useEffect, useRef, useState } from "react";
import { DealRating } from "../api/types";
import { Icon } from "./Icon";

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

/* ---- score bands ------------------------------------------------------------ */

/**
 * Four bands, read the same way everywhere: spruce is earned, lake is solid,
 * amber is a caution, brake-light red is a warning. Orange is deliberately not
 * one of them — it belongs to actions and the number-one car.
 */
export function scoreHex(total: number): string {
  if (total >= 80) return "var(--good)";
  if (total >= 65) return "var(--strong)";
  if (total >= 50) return "var(--fair)";
  return "var(--bad)";
}

export function scoreColor(total: number): string {
  if (total >= 80) return "text-good";
  if (total >= 65) return "text-strong";
  if (total >= 50) return "text-fair";
  return "text-bad";
}

/** Compact score for places without room for the strip (new-car tiles). */
export function ScoreChip({ total }: { total: number }) {
  const n = Math.round(total);
  return (
    <span
      className="nums display inline-flex items-baseline gap-0.5 rounded-lg bg-surface px-2 py-1 text-lg shadow-[var(--shadow)]"
      style={{ color: scoreHex(total) }}
      aria-label={`Score ${n} out of 100`}
    >
      {n}
      <span className="text-[11px] font-semibold text-faint" style={{ fontStretch: "100%" }}>
        /100
      </span>
    </span>
  );
}

/* ---- tags ------------------------------------------------------------------- */

const DEAL_TONE: Record<DealRating, string> = {
  "Excellent Deal": "var(--good)",
  "Great Deal": "var(--good)",
  "Good Deal": "var(--strong)",
  "Fair Price": "var(--muted)",
  "Above Market": "var(--fair)",
  Overpriced: "var(--bad)",
};

/** "Excellent Deal" → "Excellent deal". The data's title case reads as shouting in a sentence. */
export const dealLabel = (r: DealRating) => r.charAt(0) + r.slice(1).toLowerCase();

export function DealTag({ rating }: { rating: DealRating }) {
  const tone = DEAL_TONE[rating];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold"
      style={{ color: tone, backgroundColor: `color-mix(in oklab, ${tone} 11%, transparent)` }}
    >
      {dealLabel(rating)}
    </span>
  );
}

const BADGE_TONE: Record<string, string> = {
  "Best Reliability": "var(--strong)",
  "Best Winter": "var(--strong)",
  "Lowest Mileage": "var(--good)",
  "Best Resale": "var(--good)",
  "Excellent Deal": "var(--good)",
  CPO: "var(--good)",
};

/** A quieter tag than the deal rating: outlined, for secondary facts. */
export function Badge({ label }: { label: string }) {
  const tone = BADGE_TONE[label] ?? "var(--muted)";
  const text = label === "CPO" ? "Certified pre-owned" : label.charAt(0) + label.slice(1).toLowerCase();
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium"
      style={{ color: tone, borderColor: `color-mix(in oklab, ${tone} 35%, transparent)` }}
    >
      {text}
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-strong/10 px-2 py-0.5 text-[12px] font-semibold text-strong">
      <span className="h-1.5 w-1.5 rounded-full bg-strong" aria-hidden />
      Added recently
    </span>
  );
}

/**
 * "May qualify for the federal EV Affordability Program" — money back, so it
 * takes the savings colour. The title carries the confirm-before-you-buy caveat.
 */
export function EvapBadge({ rebateAmount, reason }: { rebateAmount: number; reason: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-good/10 px-2 py-0.5 text-[12px] font-semibold text-good"
      title={reason}
    >
      EVAP rebate up to ${rebateAmount.toLocaleString("en-CA")}
    </span>
  );
}

/* ---- form controls ---------------------------------------------------------- */

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
    <div role="group" aria-label={ariaLabel} className="grid grid-flow-col auto-cols-fr rounded-lg border border-line p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors ${
              active ? "bg-text text-bg" : "text-muted hover:text-text"
            }`}
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
 * Themed dropdown — native option lists can't be styled and look broken in
 * night mode. Button plus listbox; closes on outside click and Escape.
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
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-line-strong"
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <Icon name="chevron-down" size={16} className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-max overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow)]"
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
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                    active ? "bg-surface2 font-semibold text-text" : "text-text hover:bg-surface2"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <Icon name="check" size={15} className="text-accent-ink" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-text" : "bg-line-strong"
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] rounded-full bg-surface shadow transition-transform ${
            checked ? "translate-x-[19px]" : "translate-x-[3px]"
          }`}
        />
      </button>
    </label>
  );
}
