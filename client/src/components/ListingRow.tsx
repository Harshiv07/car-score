import { memo } from "react";
import { Link } from "react-router-dom";
import { ScoredListing } from "../api/types";
import { useFavorites } from "../hooks/useFavorites";
import { useCompare } from "../hooks/useCompare";
import { usePrefetchListing } from "../api/hooks";
import { CarPhoto } from "./CarPhoto";
import { ScoreStrip } from "./ScoreStrip";
import { Icon } from "./Icon";
import { whyLine, kmPerYear, mileageVerdict, scoreBand } from "../lib/whyLine";
import { quickMonthly } from "../lib/finance";
import { Badge, cad, DealTag, EvapBadge, isRecent, km, NewBadge, scoreHex, timeAgo } from "./ui";

/**
 * One car on the leaderboard, as a row in a ledger rather than a card in a
 * grid — this is a ranking, and rows keep the ranks lined up.
 *
 * Reading order: rank and score (is it good?), photo (what is it?), title and
 * the case for it (should I care?), the composition strip (where did the points
 * go?), then price and monthly (can I afford it?) on the right where a column
 * of prices can be scanned top to bottom.
 *
 * The whole row is one link (a stretched anchor on the title), and the three
 * actions sit above it as real buttons in the tab order.
 */
function ListingRowImpl({ listing, rank }: { listing: ScoredListing; rank?: number }) {
  const l = listing;
  const savings = l.score.market.savings;
  const { isFavorite, toggle } = useFavorites();
  const { has: inCompare, toggle: toggleCompare, canAdd } = useCompare();
  const fav = isFavorite(l.dedupeKey);
  const comparing = inCompare(l.id);
  const perYear = kmPerYear(l);
  const prefetch = usePrefetchListing();
  const mileage = mileageVerdict(l);
  const hex = scoreHex(l.score.total);
  const n = Math.round(l.score.total);
  const place = l.city ? `${tidyCity(l.city)}${l.province ? `, ${l.province}` : ""}` : null;
  const badges = l.badges.filter((b) => b !== l.score.dealRating && b !== "CPO");

  const actions = (
    <div className="relative z-10 flex items-center">
      {l.listingUrl && (
        <a
          href={l.listingUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={`Open on ${l.sourceWebsite}`}
          className="icon-btn"
        >
          <Icon name="external" />
          <span className="sr-only">Open this listing on {l.sourceWebsite} (opens in a new tab)</span>
        </a>
      )}
      <button
        onClick={() => toggleCompare(l.id)}
        disabled={!comparing && !canAdd}
        aria-pressed={comparing}
        title={comparing ? "Remove from comparison" : canAdd ? "Add to comparison" : "Comparison is full (3 cars)"}
        className="icon-btn"
      >
        <Icon name="compare" />
        <span className="sr-only">{comparing ? "Remove from comparison" : "Add to comparison"}</span>
      </button>
      <button
        onClick={() => toggle(l.dedupeKey)}
        aria-pressed={fav}
        title={fav ? "Remove from saved" : "Save this car"}
        className="icon-btn"
      >
        <Icon name={fav ? "heart-fill" : "heart"} />
        <span className="sr-only">{fav ? "Remove from saved" : "Save this car"}</span>
      </button>
    </div>
  );

  return (
    <article
      onPointerEnter={() => prefetch(l.id)}
      onFocusCapture={() => prefetch(l.id)}
      className="group relative transition-colors hover:bg-surface2/60"
    >
      <div className="grid grid-cols-1 md:grid-cols-[56px_140px_minmax(0,1fr)_150px] md:gap-5 md:px-5 md:py-5 xl:grid-cols-[60px_168px_minmax(0,1fr)_160px]">
        {/* Rank and score. On phones this sits on the photo instead. */}
        <div className="hidden flex-col md:flex">
          {rank != null && (
            <span className="nums text-[13px] font-semibold text-faint" aria-label={`Rank ${rank}`}>
              #{rank}
            </span>
          )}
          <span className="nums display mt-1 text-[34px]" style={{ color: hex }}>
            {n}
          </span>
          <span className="mt-1 text-[12px] font-semibold" style={{ color: hex }}>
            {scoreBand(l.score.total)}
          </span>
        </div>

        <div className="relative">
          <CarPhoto
            src={l.image}
            alt=""
            ratio={null}
            width={480}
            sizes="(max-width: 768px) 100vw, 168px"
            className="aspect-[16/9] w-full md:aspect-[4/3] md:rounded-[10px]"
          />
          {/* Phone: rank and score on the photo, actions in its corner. */}
          <div className="absolute bottom-2 left-2 flex items-end gap-1.5 md:hidden">
            <span
              className="nums display flex items-baseline gap-1 rounded-lg bg-surface/92 px-2 py-1.5 text-[22px] backdrop-blur-sm"
              style={{ color: hex }}
            >
              {n}
              <span className="text-[12px] font-semibold" style={{ fontStretch: "100%" }}>
                {scoreBand(l.score.total)}
              </span>
            </span>
            {rank != null && (
              <span
                className="nums rounded-md bg-surface/92 px-1.5 py-1 text-[12px] font-semibold text-muted backdrop-blur-sm"
                aria-hidden
              >
                #{rank}
              </span>
            )}
          </div>
          <div className="absolute right-1.5 top-1.5 rounded-full bg-surface/92 backdrop-blur-sm md:hidden">
            {actions}
          </div>
        </div>

        <div className="min-w-0 px-4 pb-1 pt-3 md:p-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h3 className="wide min-w-0 max-w-full truncate text-[16px] font-bold text-text">
              <Link
                to={`/listing/${l.id}`}
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                aria-label={`${l.title}, ${cad(l.price)}, score ${n} out of 100`}
              >
                {l.title}
              </Link>
            </h3>
            <DealTag rating={l.score.dealRating} />
            {l.cpo && <Badge label="CPO" />}
            {isRecent(l.firstSeenAt) && <NewBadge />}
            {l.evap?.eligible && <EvapBadge rebateAmount={l.evap.rebateAmount} reason={l.evap.reason} />}
            {badges.slice(0, 2).map((b) => (
              <Badge key={b} label={b} />
            ))}
          </div>

          {/* Price, on phones only — the desktop column handles it. */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 md:hidden">
            <span className="nums display text-[20px] text-text">{cad(l.price)}</span>
            <Delta savings={savings} />
            <span className="nums text-[13px] text-muted">≈{cad(quickMonthly(l.price, l.province))}/mo</span>
          </div>

          <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-muted">{whyLine(l, { omitPrice: true })}</p>

          <div className="mt-3 max-w-[360px]">
            <ScoreStrip breakdown={l.score.breakdown} />
          </div>

          <div className="cond mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="nums font-semibold text-text">
              {l.mileageKm != null ? km(l.mileageKm) : "Mileage n/a"}
            </span>
            {perYear && (
              <span
                className={`nums ${mileage === "high" ? "font-semibold text-fair" : mileage === "low" ? "text-good" : ""}`}
                title={
                  mileage === "high"
                    ? "Above the distance expected for this car's age"
                    : mileage === "low"
                      ? "Below the distance expected for this car's age"
                      : undefined
                }
              >
                {perYear.toLocaleString("en-CA")} km a year
              </span>
            )}
            {l.drivetrain !== "Unknown" && <span>{l.drivetrain}</span>}
            {place && <span className="truncate">{place}</span>}
          </div>
        </div>

        <div className="hidden flex-col items-end text-right md:flex">
          <span className="nums display text-[22px] text-text">{cad(l.price)}</span>
          <Delta savings={savings} />
          <span className="nums mt-1 text-[13px] text-muted">≈{cad(quickMonthly(l.price, l.province))}/mo</span>
          <div className="mt-auto pt-3">{actions}</div>
          <span className="mt-1 text-[12px] text-faint">
            {l.sourceWebsite}, {timeAgo(l.firstSeenAt)}
          </span>
        </div>

        <p className="px-4 pb-4 text-[12px] text-faint md:hidden">
          {l.sourceWebsite}, {timeAgo(l.firstSeenAt)}
        </p>
      </div>
    </article>
  );
}

/** Some sources shout city names ("VAUGHAN"); bring them back to normal case. */
export function tidyCity(city: string): string {
  return city === city.toUpperCase() ? city.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase()) : city;
}

export function Delta({ savings }: { savings: number }) {
  if (savings > 0) return <span className="nums text-[13px] font-semibold text-good">{cad(savings)} under market</span>;
  if (savings < -500)
    return <span className="nums text-[13px] font-semibold text-bad">{cad(-savings)} over market</span>;
  return <span className="text-[13px] text-muted">At market price</span>;
}

/** Memoised: a filter change or a sibling's save shouldn't redraw every row. */
export const ListingRow = memo(ListingRowImpl);
