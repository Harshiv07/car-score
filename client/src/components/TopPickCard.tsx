import { memo } from "react";
import { Link } from "react-router-dom";
import { MetaResponse, ScoreCategory, ScoredListing } from "../api/types";
import { usePrefetchListing } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { CarPhoto } from "./CarPhoto";
import { CarSilhouette } from "./CarSilhouette";
import { CountUp } from "./motion";
import { Icon } from "./Icon";
import { bodyStyleFor } from "../three/bodyStyle";
import { scoreBand } from "../lib/whyLine";
import { quickMonthly } from "../lib/finance";
import { cad, scoreHex } from "./ui";

/**
 * The best car for the current query, set as a window sticker: the real photo
 * on the left, and on the right the same ruled boxes a dealer's sticker has.
 * Title and score, then what it costs against what it is worth, then every
 * category the score was made of, so the number is never taken on trust.
 */
function TopPickCardImpl({
  listing,
  meta,
  filtered,
}: {
  listing: ScoredListing;
  meta: MetaResponse | undefined;
  filtered: boolean;
}) {
  const l = listing;
  const prefetch = usePrefetchListing();
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(l.dedupeKey);
  const body = meta?.models.find((m) => m.make === l.make && m.model === l.model)?.body;
  const suv = bodyStyleFor(body) === "suv";
  const hex = scoreHex(l.score.total);
  const gap = l.score.market.savings; // positive = under market
  const place = [l.city, l.province].filter(Boolean).join(", ");
  const cats = l.score.breakdown.filter((c) => c.max > 0);

  return (
    <section aria-labelledby="toppick-heading" className="sticker" onPointerEnter={() => prefetch(l.id)}>
      <div className="sticker-bar">
        <span id="toppick-heading">{filtered ? "Best match" : "Top pick"}</span>
        <span className="nums normal-case tracking-normal">
          {[place, l.sourceWebsite].filter(Boolean).join(" · ")}
        </span>
      </div>

      <div className="grid lg:grid-cols-[5fr_7fr]">
        <div className="border-b-2 border-rule lg:border-b-0 lg:border-r-2">
          <CarPhoto
            src={l.image}
            alt={l.title}
            ratio={null}
            width={800}
            sizes="(min-width: 1024px) 460px, 100vw"
            priority
            className="h-full min-h-[220px] w-full"
            fallback={<CarSilhouette suv={suv} className="w-[78%] max-w-[420px]" />}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto]">
          <div className="border-b border-rule px-4 py-3 sm:px-5">
            <h2 className="display text-[26px] sm:text-[30px]">
              <Link to={`/listing/${l.id}`} className="hover:text-accent-ink">
                {l.title}
              </Link>
            </h2>
            <p className="nums mt-1 text-[12px] uppercase tracking-[0.04em] text-muted">
              {[l.mileageKm != null ? `${l.mileageKm.toLocaleString("en-CA")} km` : null, l.drivetrain !== "Unknown" ? l.drivetrain : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="row-span-2 grid min-w-[104px] place-items-center border-b border-l border-rule px-3 py-3 text-center sm:min-w-[148px]">
            <div>
              <CountUp
                value={l.score.total}
                className="nums block text-[48px] font-semibold leading-none sm:text-[64px]"
                style={{ color: hex }}
              />
              <span className="label mt-2" style={{ color: hex }}>
                {scoreBand(l.score.total)}
              </span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-rule px-4 py-3 sm:flex sm:flex-wrap sm:gap-x-8 sm:px-5">
            <Field label="Asking">
              <span className="nums text-[26px] font-semibold leading-none">{cad(l.price)}</span>
            </Field>
            <Field label="Market value">
              <span className="nums text-[15px]">{cad(l.score.market.marketPrice)}</span>
            </Field>
            <Field label={gap >= 0 ? "Under market" : "Over market"}>
              <span className={`nums text-[15px] font-medium ${gap >= 0 ? "text-good" : "text-bad"}`}>
                {gap >= 0 ? "−" : "+"}
                {cad(Math.abs(gap))}
              </span>
            </Field>
            <Field label="Monthly">
              <span className="nums text-[15px]">≈{cad(quickMonthly(l.price, l.province))}</span>
            </Field>
          </dl>

          <ul className="col-span-2 divide-y divide-line border-b border-rule" aria-label="Score breakdown">
            {cats.map((c) => (
              <Category key={c.key} c={c} />
            ))}
          </ul>

          <div className="col-span-2 flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
            <Link to={`/listing/${l.id}`} className="btn btn-primary">
              Open report
            </Link>
            <button onClick={() => toggle(l.dedupeKey)} aria-pressed={fav} className="btn">
              <Icon name={fav ? "heart-fill" : "heart"} size={16} className={fav ? "text-accent-ink" : ""} />
              {fav ? "Saved" : "Save"}
            </button>
            {l.listingUrl && (
              <a
                href={l.listingUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="ml-1 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text"
              >
                View on {l.sourceWebsite}
                <Icon name="external" size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/** One ruled row of the breakdown: the category, a bar to scale, the points. */
function Category({ c }: { c: ScoreCategory }) {
  const frac = Math.max(0, Math.min(1, c.points / c.max));
  const weak = frac < 0.5;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-1.5 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_84px] sm:px-5">
      <span className={weak ? "font-semibold text-bad" : ""}>{c.label}</span>
      <span className="hidden h-2 bg-line sm:block" aria-hidden>
        <span className="block h-full" style={{ width: `${frac * 100}%`, background: weak ? "var(--bad)" : "var(--text)" }} />
      </span>
      <span className="nums whitespace-nowrap text-right">
        {round(c.points)} / {c.max}
      </span>
    </li>
  );
}

const round = (n: number) => (Math.round(n * 10) / 10).toString();

export const TopPickCard = memo(TopPickCardImpl);
