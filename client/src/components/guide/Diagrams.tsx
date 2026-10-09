
/**
 * Diagrams for things a description alone doesn't teach.
 *
 * Tread wear and rust location are both pattern-recognition problems: you can
 * read "uneven wear suggests alignment" ten times and still not spot it in a
 * dealer's lot. Drawing the patterns is the point — the reader is meant to look
 * at these, then look at the car, and match.
 */

/* ---- tyre wear ----------------------------------------------------------- */

interface Pattern {
  label: string;
  cause: string;
  /** Relative depth 0-1 across the tread, outer edge → inner edge. */
  depths: number[];
  tone: "bad" | "warn" | "good";
}

const PATTERNS: Pattern[] = [
  { label: "Even", cause: "Correctly inflated and aligned. This is what you want.", depths: [1, 1, 1, 1, 1], tone: "good" },
  { label: "Worn in the centre", cause: "Over-inflated: the middle of the tread carries the load. Cheap to correct, but check the others match.", depths: [1, 0.8, 0.35, 0.8, 1], tone: "warn" },
  { label: "Worn at both edges", cause: "Under-inflated, often for a long time. Also ask whether it has been driven low enough to damage a sidewall.", depths: [0.35, 0.75, 1, 0.75, 0.35], tone: "warn" },
  { label: "Worn on one side", cause: "Alignment or worn suspension. The alignment is cheap; the suspension part that caused it is not.", depths: [0.3, 0.55, 0.8, 0.95, 1], tone: "bad" },
];

const TONE: Record<Pattern["tone"], string> = { good: "var(--good)", warn: "var(--fair)", bad: "var(--bad)" };

export function TyreWear() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PATTERNS.map((p) => (
        <figure key={p.label} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <svg viewBox="0 0 100 62" className="w-full" role="img" aria-label={`Tread cross-section: ${p.label}`}>
            {/* Tyre carcass */}
            <rect x="6" y="40" width="88" height="16" rx="3" fill="var(--surface2)" stroke="var(--line)" />
            {/* Tread blocks, height = remaining depth */}
            {p.depths.map((d, j) => {
              const h = 6 + d * 26;
              const x = 8 + j * 17.2;
              return (
                <rect key={j} x={x} y={40 - h} width="14" height={h} rx="2" fill={TONE[p.tone]} opacity={0.9} />
              );
            })}
          </svg>
          <figcaption className="mt-3">
            <p className="text-[15px] font-bold text-text">{p.label}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{p.cause}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* ---- where rust starts --------------------------------------------------- */

const RUST = [
  { x: 24, y: 68, label: "Rocker panels", note: "Below the doors: salt sits here" },
  { x: 33, y: 60, label: "Wheel arch lips", note: "Front arches go first" },
  { x: 70, y: 62, label: "Rear arches", note: "Behind the rear wheels" },
  { x: 50, y: 84, label: "Subframe & floor", note: "Structural: a walk-away" },
  { x: 84, y: 46, label: "Tailgate & boot well", note: "Water pools where the spare lives" },
  { x: 14, y: 44, label: "Under the doors", note: "Open them and look at the underside" },
];

export function RustMap() {
  return (
    <div className="rounded-[20px] border border-line bg-surface p-4 sm:p-6">
      <svg viewBox="0 0 400 200" className="w-full" role="img" aria-label="Where rust typically starts on a car driven on salted roads">
        <path
          d="M42 140 L48 108 Q54 92 74 88 L140 80 Q168 60 214 60 Q262 60 288 82 L338 92 Q362 98 364 118 L366 140 Z"
          fill="color-mix(in oklab, var(--bad) 6%, var(--surface))"
          stroke="var(--line-strong)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {[108, 300].map((cx) => (
          <circle key={cx} cx={cx} cy="140" r="26" fill="var(--bg)" stroke="var(--line-strong)" strokeWidth="2" />
        ))}

        {RUST.map((r) => (
          <g key={r.label} transform={`translate(${(r.x / 100) * 400} ${(r.y / 100) * 200})`}>
            <circle r="9" fill="var(--bad)" opacity={0.22} />
            <circle r="4" fill="var(--bad)" />
          </g>
        ))}
      </svg>

      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {RUST.map((r) => (
          <li key={r.label} className="flex items-start gap-2 text-[15px]">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bad" aria-hidden />
            <span>
              <span className="font-semibold text-text">{r.label}</span>
              <span className="block text-[13px] text-muted">{r.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---- maintenance schedule ------------------------------------------------ */

const SERVICE = [
  { when: "Every fill-up", items: ["Glance at the tyres", "Top up washer fluid"], accent: "var(--muted)" },
  { when: "Monthly", items: ["Tyre pressures when cold", "Oil level on level ground", "Every light works"], accent: "var(--muted)" },
  { when: "8,000-12,000 km", items: ["Oil and filter", "Rotate the tyres", "Cabin and engine air filters as needed"], accent: "var(--text)" },
  { when: "Twice a year", items: ["Swap winter and summer tyres", "Wash the underbody after salt season", "Check brake pads"], accent: "var(--text)" },
  { when: "Every 2 years", items: ["Brake fluid", "Coolant condition", "Battery load test"], accent: "var(--strong)" },
  { when: "By the book", items: ["Timing belt if the engine has one: a missed belt destroys the engine", "Transmission fluid", "Spark plugs"], accent: "var(--bad)" },
];

export function ServiceTimeline() {
  return (
    <ol className="relative space-y-4 border-l border-line pl-6">
      {SERVICE.map((s) => (
        <li key={s.when} className="relative rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <span
            className="absolute -left-[31px] top-6 h-3 w-3 rounded-full ring-4"
            style={{ backgroundColor: s.accent, ["--tw-ring-color" as string]: "var(--bg)" }}
            aria-hidden
          />
          <p className="wide text-[15px] font-bold" style={{ color: s.accent }}>
            {s.when}
          </p>
          <ul className="mt-2 space-y-1">
            {s.items.map((it) => (
              <li key={it} className="flex gap-2 text-[15px] text-muted">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-line-strong" aria-hidden />
                {it}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
