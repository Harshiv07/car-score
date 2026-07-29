import { memo } from "react";
import { Link } from "react-router-dom";
import { ScoredListing } from "../api/types";
import { CarPhoto } from "./CarPhoto";
import { AnimatedNumber } from "./motion";
import { usePrefetchListing } from "../api/hooks";
import { whyLine, scoreBand, kmPerYear } from "../lib/whyLine";
import { quickMonthly } from "../lib/finance";
import { cad, DealPill, km, scoreHex } from "./ui";

/**
 * The hero: the single best car for the current query, stated as an answer.
 *
 * The page's job is to tell a first-time buyer which car to look at first, so
 * the hero is that car — photo, score, and the three categories it actually won
 * on — rather than a wordmark. When filters are on it re-points at the best
 * match for those filters, which keeps it honest as the query narrows.
 */
function TopPickImpl({ listing }: { listing: ScoredListing }) {
  const n = Math.round(listing.score.total);
  const hex = scoreHex(listing.score.total);
  const perYear = kmPerYear(listing);
  const prefetch = usePrefetchListing();

  // The three dimensions this car scored highest on — its actual case.
  const top = [...listing.score.breakdown]
    .filter((c) => c.max > 0)
    .sort((a, b) => b.points / b.max - a.points / a.max)
    .slice(0, 3);

  return (
    <section aria-labelledby="toppick-heading" className="fade-up">
      <h2 id="toppick-heading" className="sr-only">
        Top pick
      </h2>

      <Link
        to={`/listing/${listing.id}`}
        // Warm the detail request on hover — it is the whole wait on click.
        onPointerEnter={() => prefetch(listing.id)}
        onFocus={() => prefetch(listing.id)}
        // Two columns only from lg. At md (768px) the split left the title column
        // ~84px wide and pushed the panel past the viewport edge.
        className="group grid gap-0 overflow-hidden rounded-3xl border border-line bg-surface transition hover:border-brand/50 lg:grid-cols-[1.1fr_1fr]"
      >
        <div className="relative">
          <CarPhoto
            src={listing.image}
            alt={listing.title}
            ratio="16/9"
            width={800}
            priority
            sizes="(max-width: 768px) 100vw, 620px"
            className="h-full w-full"
          />
          <span className="absolute left-4 top-4 rounded-full bg-brand px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] shadow-lg" style={{ color: "var(--on-brand)" }}>
            Top pick
          </span>
        </div>

        <div className="flex flex-col justify-center gap-3 p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="leading-none">
              <AnimatedNumber
                value={n}
                className="nums font-display block text-5xl font-extrabold sm:text-6xl"
                style={{ color: hex }}
              />
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: hex }}>
                {scoreBand(listing.score.total)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-xl font-extrabold leading-tight text-text transition group-hover:text-brand sm:text-2xl">
                {listing.title}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="nums text-lg font-extrabold text-text">{cad(listing.price)}</span>
                <DealPill rating={listing.score.dealRating} />
              </div>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-muted">{whyLine(listing)}</p>

          {/* What it won on — real category scores, not decoration. */}
          <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3">
            {top.map((c) => (
              <div key={c.key}>
                <dt className="truncate text-[10px] font-semibold uppercase tracking-wide text-faint">{c.label}</dt>
                <dd className="nums mt-0.5 text-sm font-bold text-text">
                  {c.points}
                  <span className="text-faint">/{c.max}</span>
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
            <span className="nums">{listing.mileageKm != null ? km(listing.mileageKm) : "mileage n/a"}</span>
            {perYear && <span className="nums">{perYear.toLocaleString("en-CA")} km/yr</span>}
            <span className="nums">≈{cad(quickMonthly(listing.price, listing.province))}/mo</span>
            <span className="truncate">
              {listing.city ? `${listing.city}${listing.province ? `, ${listing.province}` : ""}` : listing.sourceWebsite}
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}

/**
 * Memoised for the same reason as ListingCard: the hero only changes when the
 * listing behind it does, not when an unrelated bit of page state moves.
 */
export const TopPick = memo(TopPickImpl);
