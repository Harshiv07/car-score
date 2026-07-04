/** Small shared UI atoms: stars, badges, deal-rating pill, formatting. */

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

export function NewBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-600 dark:text-cyan-400">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
      NEW
    </span>
  );
}

export function Stars({ value, className = "" }: { value: number; className?: string }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className={`font-mono tracking-tight text-amber-500 dark:text-amber-400 ${className}`} title={`${value}/5`}>
      {"★".repeat(full)}
      {half ? "⯨" : ""}
      <span className="text-slate-300 dark:text-slate-600">{"★".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}</span>
    </span>
  );
}

const DEAL_STYLES: Record<DealRating, string> = {
  "Excellent Deal": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30",
  "Great Deal": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  "Good Deal": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-cyan-500/20",
  "Fair Price": "bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-slate-500/20",
  "Above Market": "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
  Overpriced: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20",
};

export function DealPill({ rating }: { rating: DealRating }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${DEAL_STYLES[rating]}`}>
      {rating}
    </span>
  );
}

const BADGE_STYLES: Record<string, string> = {
  "Excellent Deal": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "Best Reliability": "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "Best Winter": "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "Lowest Mileage": "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "Best Resale": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export function Badge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${BADGE_STYLES[label] ?? "bg-slate-500/15 text-slate-600 dark:text-slate-300"}`}
    >
      {label}
    </span>
  );
}

export function scoreColor(total: number): string {
  if (total >= 80) return "text-emerald-500 dark:text-emerald-400";
  if (total >= 65) return "text-cyan-600 dark:text-cyan-400";
  if (total >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

export function ScoreDonut({ total }: { total: number }) {
  const pct = Math.min(100, Math.max(0, total));
  const angle = pct * 3.6;
  return (
    <div
      className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full ${scoreColor(total)}`}
      style={{ background: `conic-gradient(currentColor ${angle}deg, rgb(100 116 139 / 0.2) ${angle}deg)` }}
      aria-label={`Score ${total} out of 100`}
    >
      <div className="absolute inset-1.5 rounded-full bg-white dark:bg-slate-900" />
      <span className={`relative font-mono text-lg font-bold ${scoreColor(total)}`}>{Math.round(total)}</span>
    </div>
  );
}
