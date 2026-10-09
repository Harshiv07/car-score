import { memo } from "react";
import { Link } from "react-router-dom";
import { ScoredListing } from "../api/types";
import { useFavorites } from "../hooks/useFavorites";
import { useCompare } from "../hooks/useCompare";
import { usePrefetchListing } from "../api/hooks";
import { CarPhoto } from "./CarPhoto";
import { CarSilhouette } from "./CarSilhouette";
import { ScoreStrip } from "./ScoreStrip";
import { Icon } from "./Icon";
import { whyLine, mileageVerdict, scoreBand } from "../lib/whyLine";
import { quickMonthly } from "../lib/finance";
import { Badge, cad, EvapBadge, isRecent, km, NewBadge, scoreHex } from "./ui";

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
  const prefetch = usePrefetchListing();
  const mileage = mileageVerdict(l);
  const hex = scoreHex(l.score.total);
  const n = Math.round(l.score.total);
  const place = l.city ? `${tidyCity(l.city)}${l.province ? `, ${l.province}` : ""}` : null;

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

  const meta = [
    l.mileageKm != null ? km(l.mileageKm) : "Mileage n/a",
    l.drivetrain !== "Unknown" ? l.drivetrain : null,
    place,
  ].filter(Boolean) as string[];

  return (
    <article
      onPointerEnter={() => prefetch(l.id)}
      onFocusCapture={() => prefetch(l.id)}
      className="group relative transition-colors hover:bg-surface2"
    >
      <div className="grid grid-cols-[64px_minmax(0,1fr)] md:grid-cols-[40px_92px_112px_minmax(0,1fr)_auto]">
        {rank != null && (
          <span
            className="nums hidden items-center justify-center border-r border-line text-[13px] text-faint md:flex"
            aria-label={`Rank ${rank}`}
          >
            {rank}
          </span>
        )}

        {/* The score, boxed like a sticker field. */}
        <div className="flex flex-col items-center justify-center border-r border-line px-1 py-3 text-center">
          <span className="nums text-[28px] font-semibold leading-none md:text-[30px]" style={{ color: hex }}>
            {n}
          </span>
          <span className="label mt-1.5 !text-[10px]" style={{ color: hex }}>
            {scoreBand(l.score.total)}
          </span>
        </div>

        <div className="hidden border-r border-line md:block">
          <CarPhoto
            src={l.image}
            alt=""
            ratio={null}
            width={480}
            sizes="112px"
            className="h-full min-h-[84px] w-full"
            fallback={<CarSilhouette className="w-[70%] opacity-60" />}
          />
        </div>

        <div className="min-w-0 py-3 pl-4 pr-[108px] md:px-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="wide min-w-0 max-w-full truncate text-[17px] text-text">
              <Link
                to={`/listing/${l.id}`}
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                aria-label={`${l.title}, ${cad(l.price)}, score ${n} out of 100`}
              >
                {l.title}
              </Link>
            </h3>
            {l.cpo && <Badge label="CPO" />}
            {isRecent(l.firstSeenAt) && <NewBadge />}
            {l.evap?.eligible && <EvapBadge rebateAmount={l.evap.rebateAmount} reason={l.evap.reason} />}
          </div>

          <p className="nums mt-0.5 text-[12.5px] text-muted">
            {meta.join(" · ")}
            {mileage === "high" && <span className="font-medium text-fair"> · high km for its age</span>}
          </p>

          <p className="mt-1 line-clamp-1 text-[13.5px] text-muted">{whyLine(l, { omitPrice: true })}</p>

          {/* Phone: the price sits under the title, where the right column is gone. */}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 md:hidden">
            <span className="nums text-[18px] font-semibold text-text">{cad(l.price)}</span>
            <Delta savings={savings} />
          </div>
          <div className="mt-2 max-w-[260px]">
            <ScoreStrip breakdown={l.score.breakdown} />
          </div>
        </div>

        <div className="hidden flex-col items-end justify-between border-l border-line px-4 py-3 text-right md:flex">
          <div>
            <span className="nums block text-[20px] font-semibold text-text">{cad(l.price)}</span>
            <Delta savings={savings} />
            <span className="nums block text-[12.5px] text-muted">≈{cad(quickMonthly(l.price, l.province))}/mo</span>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span className="mr-1 text-[12px] text-faint">{l.sourceWebsite}</span>
            {actions}
          </div>
        </div>
      </div>

      {/* Phone: actions in the corner, clear of the stretched title link. */}
      <div className="absolute right-1 top-1 md:hidden">{actions}</div>
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
