import { ScoredListing } from "../api/types";

/**
 * The one-sentence case for a car.
 *
 * CarScore's differentiator isn't the number — AutoTrader and CarGurus already
 * show a photo and a price. It's knowing *why* a car is worth a first-time
 * buyer's time. So every card states its strongest verified reason in plain
 * language, built only from what the engine actually scored. No adjective goes
 * in that the data didn't earn.
 */

/** Category key → how to say it when the car scores well on it. */
const STRENGTHS: Record<string, string> = {
  reliability: "reliability is class-leading",
  ownership: "running costs are low",
  winter: "it's genuinely winter-ready",
  safety: "safety ratings are top-tier",
  mileage: "the odometer is well under its age",
  resale: "it holds value unusually well",
  recalls: "there's a clean recall record",
  cpo: "it still carries factory coverage",
  features: "it's well equipped",
};

/** Category key → how to say it when the car scores badly on it. */
const WEAKNESSES: Record<string, string> = {
  reliability: "reliability is the weak spot",
  ownership: "running costs run high",
  winter: "it's not set up for winter",
  safety: "safety scores trail its class",
  mileage: "the mileage is high for its age",
  resale: "resale value is soft",
  recalls: "it has open recall history",
};

const MONEY = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;

/**
 * Builds the headline reason. Money leads when there's real money on the table
 * — it's what a budget-constrained first buyer reacts to first — otherwise the
 * strongest scored dimension leads.
 */
export function whyLine(l: ScoredListing, opts: { omitPrice?: boolean } = {}): string {
  // The leaderboard card already prints "$3,646 under market" on its price row,
  // so repeating it here spent the one sentence the card gets on something the
  // reader had just read. Callers that show the delta themselves ask for the
  // rest of the case instead.
  const savings = opts.omitPrice ? 0 : l.score.market.savings;

  // Strongest and weakest scored dimensions, ignoring market (priced separately).
  const scored = l.score.breakdown
    .filter((c) => c.max > 0 && c.key !== "market" && c.key !== "value")
    .map((c) => ({ key: c.key, frac: c.points / c.max }));

  const strengths = scored.filter((c) => STRENGTHS[c.key] && c.frac >= 0.8).sort((a, b) => b.frac - a.frac);
  const worst = scored.filter((c) => WEAKNESSES[c.key] && c.frac <= 0.34).sort((a, b) => a.frac - b.frac)[0];

  const parts: string[] = [];

  if (savings >= 1000) parts.push(`${MONEY(savings)} under market`);
  else if (savings <= -1500) parts.push(`${MONEY(-savings)} over market`);

  // With the price clause suppressed a single strength left most cards saying
  // the same short thing — "the odometer is well under its age" three rows
  // running — so the sentence carries the two strongest reasons instead of one.
  // The money is still doing the talking when it is included; it just isn't
  // crowding out the rest of the case when it isn't.
  const wanted = parts.length === 0 ? 2 : 1;
  parts.push(...strengths.slice(0, wanted).map((c) => STRENGTHS[c.key]));

  // Nothing stood out either way — say something true rather than nothing.
  if (parts.length === 0) {
    if (l.score.total >= 70) parts.push("solid all round, with no category dragging it down");
    else parts.push("scores middling across the board");
  }

  let sentence = joinParts(parts);

  // One honest caveat, so the line isn't pure salesmanship.
  if (worst && WEAKNESSES[worst.key]) sentence += ` — but ${WEAKNESSES[worst.key]}`;

  return capitalize(sentence) + ".";
}

function joinParts(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, and ${parts.slice(1).join(", ")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Plain-language band for a score, used as the label beside the numeral. */
export function scoreBand(total: number): string {
  if (total >= 80) return "Excellent";
  if (total >= 65) return "Strong";
  if (total >= 50) return "Fair";
  return "Weak";
}

/** Mileage relative to what's expected for the car's age, as a short phrase. */
export function kmPerYear(l: ScoredListing): number | null {
  if (l.mileageKm == null) return null;
  const age = Math.max(1, new Date().getFullYear() - l.year);
  return Math.round(l.mileageKm / age);
}

/**
 * How the engine judged this car's odometer: "high", "low" or "normal".
 *
 * Read from the scored Mileage category rather than a threshold invented in the
 * UI, so the number on the card and the sentence beside it can never disagree —
 * a card that says "the mileage is high for its age" while styling 33,505 km/yr
 * as unremarkable grey is telling the reader two different things.
 */
export function mileageVerdict(l: ScoredListing): "high" | "low" | "normal" {
  const c = l.score.breakdown.find((b) => b.key === "mileage");
  if (!c || !c.max) return "normal";
  const frac = c.points / c.max;
  if (frac <= 0.4) return "high";
  if (frac >= 0.85) return "low";
  return "normal";
}
