import { memo } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ScoredListing } from "../api/types";
import { useFavorites } from "../hooks/useFavorites";
import { useCompare } from "../hooks/useCompare";
import { usePrefetchListing } from "../api/hooks";
import { CarPhoto } from "./CarPhoto";
import { whyLine, kmPerYear, mileageVerdict } from "../lib/whyLine";
import { quickMonthly } from "../lib/finance";
import { Badge, cad, DealPill, Fact, isRecent, km, NewBadge, ScoreSpine, scoreHex, timeAgo } from "./ui";

/**
 * One car on the leaderboard.
 *
 * Two layouts, because a phone and a desktop want different things. Above 640px
 * it's a row — score spine, photo, then content — and the spine turns the list
 * into a bar chart of quality as you scroll. Below that the row would leave the
 * text column about 180px wide, which truncated every title and wrapped badges
 * onto three lines, so the card stacks: full-width photo with the score on it,
 * then the text at full width.
 *
 * Reading order either way: score (is it good?) → photo (what is it?) → title
 * and price (can I afford it?) → the why line (should I care?) → hard facts.
 */
function ListingCardImpl({ listing, rank }: { listing: ScoredListing; rank?: number }) {
  const savings = listing.score.market.savings;
  const { isFavorite, toggle } = useFavorites();
  const { has: inCompare, toggle: toggleCompare, canAdd } = useCompare();
  const fav = isFavorite(listing.dedupeKey);
  const comparing = inCompare(listing.id);
  const perYear = kmPerYear(listing);
  const prefetch = usePrefetchListing();
  const mileage = mileageVerdict(listing);
  const where =
    [listing.dealer, listing.city && `${listing.city}${listing.province ? `, ${listing.province}` : ""}`]
      .filter(Boolean)
      .join(" · ") || listing.sourceWebsite;

  // The deal rating is already a pill; drop the duplicate badge.
  const badges = listing.badges.filter((b) => b !== listing.score.dealRating);

  return (
    // A small lift on hover so the row you are pointing at separates from the
    // column. `whileHover` rather than a CSS transform so reduced-motion users
    // get the border/shadow change without the movement.
    <motion.article
      // Hovering a card is a reliable signal it is about to be opened, and the
      // detail request is the whole wait. Warm it now; the click then paints.
      onPointerEnter={() => prefetch(listing.id)}
      onFocusCapture={() => prefetch(listing.id)}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="group relative overflow-hidden rounded-2xl border border-line bg-surface transition-[border-color,box-shadow] hover:border-brand/40 hover:shadow-lg hover:shadow-black/20"
    >
      <Link
        to={`/listing/${listing.id}`}
        className="flex flex-col sm:flex-row sm:gap-4 sm:p-4"
        aria-label={`${listing.title}, ${cad(listing.price)}, score ${Math.round(listing.score.total)} out of 100`}
      >
        {/* Desktop spine */}
        <div className="hidden sm:flex">
          <ScoreSpine total={listing.score.total} rank={rank} />
        </div>

        <div className="relative shrink-0 sm:w-44">
          <CarPhoto
            src={listing.image}
            alt=""
            ratio={null}
            width={480}
            sizes="(max-width: 640px) 100vw, 176px"
            className="aspect-[16/9] w-full sm:aspect-[4/3] sm:rounded-xl"
          />

          {/* Mobile score, sat on the photo so it stays first in the reading
              order without stealing a column from the text. */}
          <div className="absolute bottom-2 left-2 flex items-end gap-1.5 sm:hidden">
            <span
              className="nums font-display rounded-lg px-2 py-1 text-xl font-extrabold leading-none backdrop-blur-sm"
              style={{ color: scoreHex(listing.score.total), backgroundColor: "color-mix(in oklab, var(--bg) 78%, transparent)" }}
            >
              {Math.round(listing.score.total)}
              <span className="text-[11px] font-bold text-faint">/100</span>
            </span>
            {rank != null && (
              <span
                className="nums rounded-md px-1.5 py-0.5 text-[11px] font-bold text-muted backdrop-blur-sm"
                style={{ backgroundColor: "color-mix(in oklab, var(--bg) 78%, transparent)" }}
                aria-hidden
              >
                #{rank}
              </span>
            )}
          </div>
        </div>

        {/* Right padding reserves the action cluster — now three controls
            (open on source, compare, save), not two. */}
        <div className="min-w-0 flex-1 p-3 pr-[6.5rem] sm:p-0 sm:pr-28">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Full width on mobile so the pill wraps below instead of
                squeezing the title into an ellipsis. On desktop it's capped
                rather than flexible, so the deal pill stays beside the title
                it describes instead of being pushed to the far edge. */}
            <h3 className="w-full min-w-0 truncate text-[15px] font-bold text-text transition group-hover:text-brand sm:w-auto sm:max-w-[58%]">
              {listing.title}
            </h3>
            <DealPill rating={listing.score.dealRating} />
            {listing.cpo && <Badge label="CPO" />}
            {isRecent(listing.firstSeenAt) && <NewBadge />}
          </div>

          {/* Price line. The monthly figure is what this audience actually
              decides on, so it is a legible chip rather than faint grey. */}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="nums font-display text-xl font-extrabold text-text">{cad(listing.price)}</span>
            {savings > 0 ? (
              <span className="nums text-sm font-semibold text-good">{cad(savings)} under market</span>
            ) : savings < -500 ? (
              <span className="nums text-sm font-semibold text-bad">{cad(-savings)} over market</span>
            ) : null}
            <span className="nums rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              ≈{cad(quickMonthly(listing.price, listing.province))}/mo
            </span>
          </div>

          {/* The case for this car, in one sentence — minus the price delta the
              row above already states. */}
          <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-muted">
            {whyLine(listing, { omitPrice: true })}
          </p>

          {/* Hard facts: the vehicle first, then where it is, with a divider
              between them so specs and provenance stop reading as one list. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
            <Fact value={listing.mileageKm != null ? km(listing.mileageKm) : "—"} />
            {perYear && (
              // Coloured by the engine's own verdict, so the number agrees with
              // the sentence above it instead of sitting in neutral grey while
              // the why line calls the mileage high.
              <span
                className={`nums ${
                  mileage === "high" ? "font-semibold text-warn" : mileage === "low" ? "text-good" : "text-faint"
                }`}
                title={
                  mileage === "high"
                    ? "Above the distance expected for this car's age"
                    : mileage === "low"
                      ? "Below the distance expected for this car's age"
                      : undefined
                }
              >
                {perYear.toLocaleString("en-CA")} km/yr
              </span>
            )}
            {listing.drivetrain !== "Unknown" && <Fact value={listing.drivetrain} />}
            {where && (
              <>
                <span className="text-line-strong" aria-hidden>
                  |
                </span>
                <span className="truncate text-faint">{where}</span>
              </>
            )}
          </div>

          {badges.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <Badge key={b} label={b} />
              ))}
            </div>
          )}

          {/* Source + freshness, quiet and out of the reading path. */}
          <p className="mt-2 text-[11px] text-faint sm:absolute sm:bottom-3 sm:right-4 sm:mt-0">
            {listing.sourceWebsite} · {timeAgo(listing.firstSeenAt)}
          </p>
        </div>
      </Link>

      {/* Actions sit outside the Link so they're real buttons in the tab order. */}
      <div className="absolute right-2 top-2 flex items-center gap-1 sm:right-3 sm:top-3">
        {listing.listingUrl && (
          // Straight to the seller's own page. Plenty of the time the reader
          // has already decided from the card and wants the actual listing —
          // making them open our detail page first is a tollbooth, not a step.
          // A real anchor, so middle-click and "open in new tab" behave.
          <motion.a
            href={listing.listingUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            title={`Open this listing on ${listing.sourceWebsite}`}
            whileTap={{ scale: 0.85 }}
            transition={{ type: "spring", stiffness: 600, damping: 20 }}
            className="grid h-8 w-8 place-items-center rounded-full text-[13px] text-muted backdrop-blur-sm transition-colors hover:text-brand"
            style={{ backgroundColor: "color-mix(in oklab, var(--surface) 70%, transparent)" }}
          >
            <span aria-hidden>↗</span>
            <span className="sr-only">Open this listing on {listing.sourceWebsite} (opens in a new tab)</span>
          </motion.a>
        )}
        <IconButton
          onClick={() => toggleCompare(listing.id)}
          disabled={!comparing && !canAdd}
          pressed={comparing}
          title={comparing ? "Remove from comparison" : canAdd ? "Add to comparison" : "Comparison is full (3 cars)"}
          label={comparing ? "Remove from comparison" : "Add to comparison"}
          glyph="⇄"
          activeClass="bg-brand/15 text-brand"
        />
        <IconButton
          onClick={() => toggle(listing.dedupeKey)}
          pressed={fav}
          title={fav ? "Remove from saved" : "Save this car"}
          label={fav ? "Remove from saved" : "Save this car"}
          glyph={fav ? "♥" : "♡"}
          activeClass="text-bad"
        />
      </div>
    </motion.article>
  );
}

function IconButton({
  onClick,
  disabled,
  pressed,
  title,
  label,
  glyph,
  activeClass,
}: {
  onClick: () => void;
  disabled?: boolean;
  pressed: boolean;
  title: string;
  label: string;
  glyph: string;
  activeClass: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      whileTap={{ scale: 0.85 }}
      transition={{ type: "spring", stiffness: 600, damping: 20 }}
      className={`grid h-8 w-8 place-items-center rounded-full text-[15px] backdrop-blur-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        pressed ? activeClass : "text-muted hover:text-text"
      }`}
      style={{ backgroundColor: "color-mix(in oklab, var(--surface) 70%, transparent)" }}
    >
      {/* Swapping the glyph on a key change gives the toggle a beat of its own,
          so a save reads as an action rather than a silent style change. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={glyph}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.15 }}
          aria-hidden
        >
          {glyph}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">{label}</span>
    </motion.button>
  );
}

/**
 * Memoised. A page holds a dozen of these, and each renders a photo, a score
 * spine, a computed why-line and a payment estimate — none of which change
 * because a filter moved or a sibling card was saved. Re-rendering the whole
 * list on every parent update was the bulk of the work done on a filter change.
 */
export const ListingCard = memo(ListingCardImpl);
