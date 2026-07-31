import { motion } from "framer-motion";

/**
 * What changes depending on who is selling the car.
 *
 * This is the most consequential thing on the page and the least visible in a
 * listing. The same car at the same price carries completely different
 * protections depending on whether the seller is a registered dealer or someone
 * in a driveway — and CarScore's own leaderboard mixes all three types without
 * the difference being obvious, because an AutoTrader listing can be any of
 * them.
 *
 * Laid out as columns rather than prose because the reader's real question is
 * comparative: "I'm looking at this listing — what do I get, and what do I have
 * to arrange myself?"
 */

type Answer = "yes" | "no" | "maybe";

interface SellerType {
  key: string;
  name: string;
  who: string;
  sources: string;
  accent: string;
  rows: { label: string; answer: Answer; note: string }[];
}

const TYPES: SellerType[] = [
  {
    key: "franchise",
    name: "Franchised dealer",
    who: "A brand's own dealership, selling used stock alongside new.",
    sources: "Wayne Toyota · Superior Hyundai · Gore Motors Honda · Half-Way Motors Mazda",
    accent: "var(--good)",
    rows: [
      { label: "Regulated seller", answer: "yes", note: "OMVIC-registered in Ontario, bound by the Motor Vehicle Dealers Act." },
      { label: "Compensation fund", answer: "yes", note: "You can claim against the fund if the dealer fails you. Private sales have no equivalent." },
      { label: "Must disclose history", answer: "yes", note: "Accident damage over the threshold, previous taxi/police/rental use, a branded title." },
      { label: "Safety certificate", answer: "maybe", note: "Included if sold certified. If it's advertised as-is, you pay for it and for whatever it fails on." },
      { label: "Manufacturer CPO available", answer: "maybe", note: "Only on their own brand, and only on cars young enough to qualify." },
      { label: "Independent inspection still worth it", answer: "yes", note: "Their inspection is theirs. A safety certificate is a legal minimum, not a health check." },
    ],
  },
  {
    key: "online",
    name: "Online retailer",
    who: "Buys cars, reconditions them, delivers to your door. No lot, no test drive first.",
    sources: "Clutch.ca",
    accent: "var(--info)",
    rows: [
      { label: "Regulated seller", answer: "yes", note: "A registered dealer, with the same obligations as a physical one." },
      { label: "Compensation fund", answer: "yes", note: "Same protection as any registered dealer." },
      { label: "Must disclose history", answer: "yes", note: "Plus a published inspection report and photos of cosmetic flaws." },
      { label: "Safety certificate", answer: "yes", note: "Delivered road-ready and registerable; they handle the paperwork." },
      { label: "Manufacturer CPO available", answer: "no", note: "\"Clutch Certified\" is their own programme — 210-point inspection, not a factory one." },
      { label: "Independent inspection still worth it", answer: "yes", note: "Use the return window for it. 10 days or 750 km, and a 90-day/6,000 km warranty on major systems." },
    ],
  },
  {
    key: "private",
    name: "Private seller",
    who: "An individual selling their own car. Cheapest, and entirely on you.",
    sources: "Many AutoTrader.ca listings — check each one",
    accent: "var(--bad)",
    rows: [
      { label: "Regulated seller", answer: "no", note: "No regulator has jurisdiction. If it goes wrong, your only route is civil court." },
      { label: "Compensation fund", answer: "no", note: "None. Whatever you lose, you lose." },
      { label: "Must disclose history", answer: "no", note: "No disclosure duty beyond not actively lying. Assume nothing is volunteered." },
      { label: "Safety certificate", answer: "no", note: "Usually yours to arrange and pay for, along with anything it fails on." },
      { label: "Manufacturer CPO available", answer: "no", note: "Not applicable." },
      { label: "Independent inspection still worth it", answer: "yes", note: "Essential. There is no other safety net anywhere in this column." },
    ],
  },
];

const MARK: Record<Answer, { glyph: string; color: string; label: string }> = {
  yes: { glyph: "✓", color: "var(--good)", label: "Yes" },
  maybe: { glyph: "~", color: "var(--warn)", label: "Sometimes" },
  no: { glyph: "✕", color: "var(--bad)", label: "No" },
};

export function SellerTypes() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {TYPES.map((t, i) => (
        <motion.div
          key={t.key}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col rounded-2xl border border-line bg-surface p-5"
        >
          <div className="border-b border-line pb-4">
            <span
              className="inline-block h-1.5 w-10 rounded-full"
              style={{ backgroundColor: t.accent }}
              aria-hidden
            />
            <h3 className="mt-3 font-display text-lg font-extrabold text-text">{t.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.who}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-faint">{t.sources}</p>
          </div>

          <dl className="mt-4 space-y-3.5">
            {t.rows.map((r) => {
              const m = MARK[r.answer];
              return (
                <div key={r.label} className="flex gap-2.5">
                  <span
                    className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{ color: m.color, backgroundColor: `color-mix(in oklab, ${m.color} 14%, transparent)` }}
                    title={m.label}
                  >
                    <span aria-hidden>{m.glyph}</span>
                    <span className="sr-only">{m.label}:</span>
                  </span>
                  <div className="min-w-0">
                    <dt className="text-sm font-semibold text-text">{r.label}</dt>
                    <dd className="mt-0.5 text-xs leading-relaxed text-muted">{r.note}</dd>
                  </div>
                </div>
              );
            })}
          </dl>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * The three things called "certified", which are not the same thing.
 *
 * Worth its own diagram because the word does more damage than any other in a
 * used-car listing: a seller can say "it's certified" and mean a 36-day legal
 * minimum, a factory-backed warranty, or their own in-house programme, and a
 * first buyer has no way to tell which from the advert.
 */
const CERTIFIED = [
  {
    term: "Safety Standards Certificate",
    what: "A licensed inspection confirming the car meets Ontario's minimum roadworthy standard on the day it was checked.",
    covers: "Brakes, tyres, lights, steering, structure",
    notCovers: "Engine, transmission, anything wearing out but not yet unsafe",
    life: "Valid 36 days",
    accent: "var(--warn)",
  },
  {
    term: "Certified Pre-Owned (CPO)",
    what: "A manufacturer programme at a franchised dealer of that brand — a longer inspection plus extended factory warranty.",
    covers: "A multi-point inspection and real warranty cover",
    notCovers: "Only applies to that brand, and only to newer, lower-mileage cars",
    life: "Warranty runs months or years",
    accent: "var(--good)",
  },
  {
    term: "\"Clutch Certified\" and similar",
    what: "A retailer's own programme. Real, but it is the seller's standard rather than a regulator's or a manufacturer's.",
    covers: "210-point inspection, 90-day/6,000 km warranty, 10-day return",
    notCovers: "Not a factory warranty, and not a legal standard",
    life: "Return window is short — use it",
    accent: "var(--info)",
  },
];

export function CertifiedMeanings() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CERTIFIED.map((c, i) => (
        <motion.div
          key={c.term}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: i * 0.07 }}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <p className="font-display text-sm font-extrabold" style={{ color: c.accent }}>
            {c.term}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{c.what}</p>

          <dl className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
            <div>
              <dt className="font-semibold text-good">Covers</dt>
              <dd className="text-muted">{c.covers}</dd>
            </div>
            <div>
              <dt className="font-semibold text-bad">Doesn't cover</dt>
              <dd className="text-muted">{c.notCovers}</dd>
            </div>
            <div>
              <dt className="font-semibold text-faint">How long</dt>
              <dd className="text-muted">{c.life}</dd>
            </div>
          </dl>
        </motion.div>
      ))}
    </div>
  );
}
