import { Link } from "react-router-dom";
import { ScoredListing } from "../api/types";
import { useFavorites } from "../hooks/useFavorites";
import { Badge, cad, DealPill, isRecent, km, NewBadge, ScoreBadge, Stars, timeAgo } from "./ui";

function cat(l: ScoredListing, key: string) {
  return l.score.breakdown.find((c) => c.key === key);
}

export function ListingCard({ listing, rank }: { listing: ScoredListing; rank?: number }) {
  const rel = cat(listing, "reliability");
  const savings = listing.score.market.savings;
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(listing.dedupeKey);

  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group relative block rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/40 hover:shadow-lg hover:shadow-black/20"
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(listing.dedupeKey);
        }}
        aria-pressed={fav}
        aria-label={fav ? "Remove from favourites" : "Add to favourites"}
        title={fav ? "Remove from favourites" : "Add to favourites"}
        className={`absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-lg transition ${
          fav ? "text-bad hover:bg-bad/10" : "text-faint hover:bg-surface-2 hover:text-bad"
        }`}
      >
        {fav ? "♥" : "♡"}
      </button>

      <div className="flex items-start gap-4">
        {rank != null && (
          <div className="nums hidden w-6 pt-2 text-center text-sm font-bold text-faint sm:block">{rank}</div>
        )}
        <div className="pt-0.5">
          <ScoreBadge total={listing.score.total} />
        </div>

        <div className="min-w-0 flex-1 pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-bold text-text transition group-hover:text-brand">
              {listing.title}
            </h3>
            {listing.listingUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(listing.listingUrl!, "_blank", "noopener,noreferrer");
                }}
                title={`Open on ${listing.sourceWebsite}`}
                className="text-sm font-semibold text-brand hover:text-brand-strong"
              >
                ↗
              </button>
            )}
            <DealPill rating={listing.score.dealRating} />
            {listing.cpo && <Badge label="CPO" />}
            {isRecent(listing.firstSeenAt) && <NewBadge />}
          </div>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="nums text-lg font-extrabold text-text">{cad(listing.price)}</span>
            {savings > 0 ? (
              <span className="nums font-semibold text-good">{cad(savings)} below market</span>
            ) : savings < -500 ? (
              <span className="nums font-semibold text-bad">{cad(-savings)} above market</span>
            ) : null}
            <span className="nums text-muted">
              {listing.mileageKm != null ? km(listing.mileageKm) : "mileage n/a"}
            </span>
            <span className="text-muted">{listing.drivetrain}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {rel && (
              <span className="flex items-center gap-1">
                Reliability <Stars value={rel.stars} />
              </span>
            )}
            <span>
              {listing.dealer ?? "Private / aggregator"}
              {listing.city ? ` · ${listing.city}${listing.province ? `, ${listing.province}` : ""}` : ""}
            </span>
            <span className="text-faint">{listing.sourceWebsite}</span>
            <span className="ml-auto text-right text-faint" title={new Date(listing.firstSeenAt).toLocaleString()}>
              Added {timeAgo(listing.firstSeenAt)}
              {listing.lastSeenAt !== listing.firstSeenAt && ` · refreshed ${timeAgo(listing.lastSeenAt)}`}
            </span>
          </div>

          {listing.badges.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {listing.badges.map((b) => (
                <Badge key={b} label={b} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
