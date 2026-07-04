import { Link } from "react-router-dom";
import { ScoredListing } from "../api/types";
import { Badge, cad, DealPill, isRecent, km, NewBadge, ScoreDonut, Stars, timeAgo } from "./ui";

function cat(l: ScoredListing, key: string) {
  return l.score.breakdown.find((c) => c.key === key);
}

export function ListingCard({ listing, rank }: { listing: ScoredListing; rank: number }) {
  const rel = cat(listing, "reliability");
  const savings = listing.score.market.savings;
  return (
    <Link
      to={`/listing/${listing.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start gap-4">
        <div className="hidden w-8 pt-1 text-center font-mono text-sm font-bold text-slate-400 dark:text-slate-500 sm:block">
          #{rank}
        </div>
        <ScoreDonut total={listing.score.total} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-slate-900 group-hover:text-cyan-700 dark:text-slate-100 dark:group-hover:text-cyan-300">
              {listing.title}
            </h3>
            <DealPill rating={listing.score.dealRating} />
            {listing.cpo && <Badge label="CPO" />}
            {isRecent(listing.firstSeenAt) && <NewBadge />}
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="font-mono text-lg font-bold text-slate-900 dark:text-white">{cad(listing.price)}</span>
            {savings > 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {cad(savings)} below market
              </span>
            ) : savings < -500 ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {cad(-savings)} above market
              </span>
            ) : null}
            <span className="text-slate-500 dark:text-slate-400">
              {listing.mileageKm != null ? km(listing.mileageKm) : "mileage n/a"}
            </span>
            <span className="text-slate-500 dark:text-slate-400">{listing.drivetrain}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {rel && (
              <span className="flex items-center gap-1">
                Reliability <Stars value={rel.stars} />
              </span>
            )}
            <span>
              {listing.dealer ?? "Private / aggregator"}
              {listing.city ? ` · ${listing.city}${listing.province ? `, ${listing.province}` : ""}` : ""}
            </span>
            <span className="font-mono">{listing.sourceWebsite}</span>
            <span title={new Date(listing.firstSeenAt).toLocaleString()}>
              Added {timeAgo(listing.firstSeenAt)}
            </span>
            {listing.lastSeenAt !== listing.firstSeenAt && (
              <span title={new Date(listing.lastSeenAt).toLocaleString()}>
                · refreshed {timeAgo(listing.lastSeenAt)}
              </span>
            )}
          </div>

          {listing.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
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
