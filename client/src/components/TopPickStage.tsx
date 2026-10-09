import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { MetaResponse, ScoredListing } from "../api/types";
import { usePrefetchListing } from "../api/hooks";
import { useFavorites } from "../hooks/useFavorites";
import { CarPhoto } from "./CarPhoto";
import { CountUp } from "./motion";
import { ScoreStrip } from "./ScoreStrip";
import { Stage, CarSilhouette, usePaint } from "./Stage";
import { Icon } from "./Icon";
import { Delta } from "./ListingRow";
import { bodyStyleFor } from "../three/bodyStyle";
import { whyLine, scoreBand } from "../lib/whyLine";
import { quickMonthly } from "../lib/finance";
import { cad, DealTag, scoreHex } from "./ui";
import { prefersReducedMotion } from "../lib/motion";

/**
 * The hero: the single best car for the current query, on a studio stage.
 *
 * The 3D car is a stand-in shaped like the pick (sedan or SUV) and painted in
 * the brand's orange — it's the "number one" plinth. The real listing photo
 * sits beside it, because a buyer should see the actual car before anything
 * else, and the scorecard below the stage carries the facts.
 */
function TopPickStageImpl({
  listing,
  meta,
  total,
  filtered,
  intro,
}: {
  listing: ScoredListing;
  meta: MetaResponse | undefined;
  total: number;
  filtered: boolean;
  intro: boolean;
}) {
  const l = listing;
  const prefetch = usePrefetchListing();
  const paint = usePaint();
  const reduced = useMemo(prefersReducedMotion, []);
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(l.dedupeKey);
  const body = meta?.models.find((m) => m.make === l.make && m.model === l.model)?.body;
  const style = bodyStyleFor(body);
  const hex = scoreHex(l.score.total);

  return (
    <section
      aria-labelledby="toppick-heading"
      className="studio relative overflow-hidden rounded-[22px] border border-line"
      onPointerEnter={() => prefetch(l.id)}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <p id="toppick-heading" className="text-[14px] font-semibold text-text">
          {filtered ? "Best match for your filters" : `Number one of ${total.toLocaleString("en-CA")}`}
        </p>
        {l.image && (
          <figure className="hidden w-[132px] shrink-0 sm:block">
            <CarPhoto
              src={l.image}
              alt={l.title}
              ratio="4/3"
              width={480}
              sizes="132px"
              priority
              quiet
              className="rounded-[10px] border border-line shadow-[var(--shadow)]"
            />
            <figcaption className="mt-1 text-right text-[12px] text-faint">The actual car</figcaption>
          </figure>
        )}
      </div>

      <Stage
        style={style}
        paint={paint}
        mode="turntable"
        reducedMotion={reduced}
        intro={intro}
        label={`A ${style === "suv" ? "SUV" : "sedan"} on a turntable, standing in for the ${l.title}. Drag to turn it.`}
        className="-mt-10 h-[230px] sm:-mt-24 sm:h-[300px]"
        fallback={
          <div className="-mt-6 flex h-[230px] items-end justify-center px-8 sm:-mt-20 sm:h-[300px]">
            <CarSilhouette suv={style === "suv"} className="w-full max-w-[460px]" />
          </div>
        }
      />

      {/* The scorecard: what the car is, why it's here, what it costs. */}
      <div className="relative mx-3 mb-3 rounded-[16px] border border-line bg-surface p-5 shadow-[var(--shadow)] sm:mx-4 sm:mb-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="flex items-end gap-3">
            <CountUp
              value={l.score.total}
              delay={intro ? 0.7 : 0}
              className="nums display text-[64px] leading-[0.85]"
              style={{ color: hex }}
            />
            <div className="pb-1">
              <p className="text-[14px] font-bold" style={{ color: hex }}>
                {scoreBand(l.score.total)}
              </p>
              <p className="text-[13px] text-faint">out of 100</p>
            </div>
          </div>

          <div className="min-w-0 flex-1 basis-64">
            <h2 className="wide text-[22px] font-extrabold leading-tight text-text">
              <Link to={`/listing/${l.id}`} className="hover:text-accent-ink">
                {l.title}
              </Link>
            </h2>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="nums display text-[22px] text-text">{cad(l.price)}</span>
              <Delta savings={l.score.market.savings} />
              <span className="nums text-[13px] text-muted">≈{cad(quickMonthly(l.price, l.province))}/mo</span>
              <DealTag rating={l.score.dealRating} />
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-muted">{whyLine(l, { omitPrice: true })}</p>

        <div className="mt-4">
          <ScoreStrip breakdown={l.score.breakdown} size="md" animate={intro} />
          <p className="mt-2 text-[12px] text-faint">
            Each block is one scoring category, as wide as the points it's worth. Red marks a category below half.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link to={`/listing/${l.id}`} className="btn btn-primary">
            Open the scorecard
          </Link>
          <button onClick={() => toggle(l.dedupeKey)} aria-pressed={fav} className="btn btn-ghost">
            <Icon name={fav ? "heart-fill" : "heart"} size={16} className={fav ? "text-accent-ink" : ""} />
            {fav ? "Saved" : "Save"}
          </button>
          {l.listingUrl && (
            <a
              href={l.listingUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn text-muted hover:text-text"
            >
              View on {l.sourceWebsite}
              <Icon name="external" size={15} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

export const TopPickStage = memo(TopPickStageImpl);
