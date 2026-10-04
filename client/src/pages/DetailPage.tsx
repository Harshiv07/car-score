import { Link, useParams } from "react-router-dom";
import { useListingDetail } from "../api/hooks";
import { ListingRow, Delta, tidyCity } from "../components/ListingRow";
import { CarPhoto } from "../components/CarPhoto";
import { PaymentEstimate } from "../components/PaymentEstimate";
import { CountUp, FillBar } from "../components/motion";
import { ScoreStrip, round } from "../components/ScoreStrip";
import { Icon } from "../components/Icon";
import { useFavorites } from "../hooks/useFavorites";
import { useCompare } from "../hooks/useCompare";
import { whyLine, scoreBand, kmPerYear } from "../lib/whyLine";
import { Badge, cad, DealTag, EvapBadge, isRecent, km, NewBadge, scoreHex, timeAgo } from "../components/ui";
import { CompareTray } from "../components/CompareTray";

const SEVERITY: Record<string, { color: string; label: string }> = {
  major: { color: "var(--bad)", label: "Major" },
  moderate: { color: "var(--fair)", label: "Moderate" },
  minor: { color: "var(--faint)", label: "Minor" },
};

const panel = "rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6";
const ruled = "border-t border-line pt-5";
const h2 = "wide text-[19px] font-bold text-text";

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useListingDetail(id);
  const { isFavorite, toggle } = useFavorites();
  const { has, toggle: toggleCompare, canAdd } = useCompare();

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2">
        <div className="aspect-[4/3] animate-pulse rounded-[16px] bg-surface" />
        <div className="space-y-4 pt-4">
          <div className="h-10 w-3/4 animate-pulse rounded bg-surface" />
          <div className="h-24 w-1/2 animate-pulse rounded bg-surface" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="wide text-[24px] font-bold text-text">This listing is gone.</p>
        <p className="mt-2 text-sm text-muted">
          Cars drop out of the inventory when a crawl no longer finds them. Usually that means they sold.
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          Back to the leaderboard
        </Link>
      </div>
    );
  }

  const { listing: l, ownership, recallHistory, modelInfo, alternatives, externalLinks } = data;
  const { market } = l.score;
  const fav = isFavorite(l.dedupeKey);
  const comparing = has(l.id);
  const perYear = kmPerYear(l);
  const original = externalLinks.find((x) => x.label === "Original listing");
  const hex = scoreHex(l.score.total);
  const n = Math.round(l.score.total);
  const place = [l.dealer, l.city && `${tidyCity(l.city)}${l.province ? `, ${l.province}` : ""}`].filter(Boolean).join(", ");
  const lost = l.score.breakdown.reduce((s, c) => s + (c.max - c.points), 0);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-6 sm:px-6">
      <Link to="/" className="inline-flex items-center gap-1 text-[14px] font-semibold text-muted hover:text-text">
        <Icon name="chevron-left" size={16} />
        Back to the leaderboard
      </Link>

      {/* Hero: the actual car, and the verdict on it. */}
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <CarPhoto
            src={l.image}
            alt={l.title}
            ratio="4/3"
            width={1024}
            priority
            sizes="(max-width: 1024px) 100vw, 640px"
            className="w-full rounded-[16px] border border-line"
          />
          <p className="mt-2 text-[13px] text-faint">
            Listed on {l.sourceWebsite}, first seen {timeAgo(l.firstSeenAt)}
          </p>
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <DealTag rating={l.score.dealRating} />
            {l.cpo && <Badge label="CPO" />}
            {isRecent(l.firstSeenAt) && <NewBadge />}
            {l.evap?.eligible && <EvapBadge rebateAmount={l.evap.rebateAmount} reason={l.evap.reason} />}
          </div>

          <h1 className="wide mt-3 text-[clamp(1.75rem,3.4vw,2.6rem)] font-extrabold leading-[1.08] text-text">{l.title}</h1>
          <p className="mt-2 text-[15px] text-muted">{place || "Private or aggregator listing"}</p>

          {/* The verdict, stated as a measurement: it counts up as you arrive. */}
          <div className="mt-6 flex items-end gap-4">
            <CountUp value={l.score.total} className="nums display text-[96px] leading-[0.8]" style={{ color: hex }} />
            <div className="pb-1">
              <p className="text-[17px] font-bold" style={{ color: hex }}>
                {scoreBand(l.score.total)}
              </p>
              <p className="text-[13px] text-faint">out of 100</p>
            </div>
          </div>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-muted">{whyLine(l, { omitPrice: true })}</p>

          <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line pt-5">
            <span className="nums display text-[34px] text-text">{cad(l.price)}</span>
            <Delta savings={market.savings} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {original && (
              <a href={original.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                View on {l.sourceWebsite}
                <Icon name="external" size={15} />
              </a>
            )}
            <button onClick={() => toggle(l.dedupeKey)} aria-pressed={fav} className="btn btn-ghost">
              <Icon name={fav ? "heart-fill" : "heart"} size={16} className={fav ? "text-accent-ink" : ""} />
              {fav ? "Saved" : "Save this car"}
            </button>
            <button
              onClick={() => toggleCompare(l.id)}
              aria-pressed={comparing}
              disabled={!comparing && !canAdd}
              className="btn btn-ghost disabled:opacity-40"
            >
              <Icon name="compare" size={16} />
              {comparing ? "In comparison" : "Compare"}
            </button>
          </div>
        </div>
      </div>

      {/* Key numbers, as one ruled band rather than four boxes. */}
      <dl className="mt-10 grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-line sm:grid-cols-4">
        <Stat label="Mileage" value={l.mileageKm != null ? km(l.mileageKm) : "n/a"} sub={perYear ? `${perYear.toLocaleString("en-CA")} km a year` : undefined} />
        <Stat
          label="Market price"
          value={cad(market.marketPrice)}
          sub={market.method === "comparables" ? `From ${market.sampleSize} comparable listings` : "Model baseline"}
        />
        <Stat label="Year" value={String(l.year)} sub={l.drivetrain !== "Unknown" ? l.drivetrain : undefined} />
        <Stat label="Running cost" value={ownership ? cad(ownership.totalAnnual) : "n/a"} sub="A year, estimated" />
      </dl>

      {/* The scorecard — the reason anyone is on this page. */}
      <section className={`${panel} mt-6`} aria-labelledby="scorecard-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="scorecard-heading" className={h2}>
            Where the {n} points came from
          </h2>
          <p className="nums text-[13px] text-faint">{round(lost)} points lost across ten categories</p>
        </div>
        <ScoreStrip breakdown={l.score.breakdown} size="lg" animate className="mt-5" />

        <ul className="mt-6 grid gap-x-10 md:grid-cols-2">
          {l.score.breakdown.map((c) => {
            const frac = c.max ? c.points / c.max : 0;
            const weak = frac < 0.5;
            return (
              <li key={c.key} className="border-t border-line py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold text-text">
                    {weak && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-bad align-[2px]" aria-label="Weak spot" />}
                    {c.label}
                  </span>
                  <span className="nums shrink-0 text-[14px] text-muted">
                    <span className={`font-bold ${weak ? "text-bad" : "text-text"}`}>{round(c.points)}</span> of {c.max}
                  </span>
                </div>
                <p className="mt-1 text-[14px] leading-snug text-muted">{c.detail}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${panel} lg:sticky lg:top-24 lg:self-start`} aria-labelledby="pay-heading">
          <h2 id="pay-heading" className={h2}>
            What you'd pay each month
          </h2>
          <div className="mt-4">
            <PaymentEstimate price={l.price} province={l.province} />
          </div>
        </section>

        <div className="space-y-6">
          {ownership && (
            <section className={ruled}>
              <h2 className={h2}>Running costs, per year</h2>
              <div className="mt-4 space-y-3">
                <CostBar label="Fuel" value={ownership.fuelAnnual} max={ownership.totalAnnual} index={0} />
                <CostBar label="Insurance" value={ownership.insuranceAnnual} max={ownership.totalAnnual} index={1} />
                <CostBar label="Maintenance" value={ownership.maintenanceAnnual} max={ownership.totalAnnual} index={2} />
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-[15px] font-semibold text-text">Total a year</span>
                <span className="nums display text-[22px] text-text">{cad(ownership.totalAnnual)}</span>
              </div>
              <p className="mt-2 text-[13px] text-faint">
                Assumes {ownership.assumptions.kmPerYear.toLocaleString("en-CA")} km a year at $
                {ownership.assumptions.fuelPriceCadPerL}/L. Insurance uses {ownership.assumptions.insuranceProvince}{" "}
                averages and varies by driver.
              </p>
            </section>
          )}

          {l.evap && (
            <section className={ruled}>
              <h2 className={h2}>EV rebate (EVAP)</h2>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <span className={`text-[15px] font-bold ${l.evap.eligible ? "text-good" : "text-muted"}`}>
                  {l.evap.eligible ? "May qualify" : "Doesn't appear to qualify"}
                </span>
                {l.evap.eligible && <span className="nums display text-[22px] text-good">{cad(l.evap.rebateAmount)}</span>}
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{l.evap.reason}</p>
              <p className="mt-2 text-[13px] text-faint">
                Canada's Electric Vehicle Affordability Program, April 2026 to March 2031. A simplified read based on
                price and make, not a legal determination. Confirm against the official eligible-vehicle list before
                you buy.
              </p>
            </section>
          )}

          {((modelInfo && modelInfo.knownIssues.length > 0) || recallHistory.length > 0) && (
            <section className={ruled}>
              <h2 className={h2}>Known issues and recalls</h2>
              {modelInfo && modelInfo.knownIssues.length > 0 && (
                <ul className="mt-3 space-y-2.5 text-[14px]">
                  {modelInfo.knownIssues.map((i) => (
                    <li key={i.title} className="flex gap-3">
                      <span
                        className="mt-0.5 shrink-0 rounded px-1.5 text-[12px] font-semibold"
                        style={{ color: SEVERITY[i.severity].color, backgroundColor: `color-mix(in oklab, ${SEVERITY[i.severity].color} 12%, transparent)` }}
                      >
                        {SEVERITY[i.severity].label}
                      </span>
                      <span className="text-text">
                        {i.title}
                        {i.note && <span className="text-muted">. {i.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {recallHistory.length > 0 && (
                <div className="mt-4">
                  <p className="text-[14px] font-semibold text-text">
                    {recallHistory.length} recall{recallHistory.length === 1 ? "" : "s"} on file for the {l.year} {l.make} {l.model}
                  </p>
                  <ul className="mt-2 space-y-2 text-[14px]">
                    {recallHistory.map((r) => (
                      <li key={r.recallNumber} className="text-muted">
                        {r.summary}{" "}
                        <span className="nums whitespace-nowrap text-[12px] text-faint">
                          (#{r.recallNumber}, {r.date})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-[13px] text-faint">
                {recallHistory.length > 0
                  ? "Every recall Transport Canada has issued for this model year, not this specific car. It doesn't say whether this VIN's recalls were completed: ask the dealer, or check with the manufacturer using the VIN."
                  : "Model-level patterns, not this specific car. Confirm open recalls by VIN before you buy."}
              </p>
            </section>
          )}

          {(l.score.pros.length > 0 || l.score.cons.length > 0) && (
            <section className={ruled}>
              <h2 className={h2}>For and against</h2>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <ul className="space-y-1.5 text-[14px]">
                  {l.score.pros.map((p) => (
                    <li key={p} className="flex gap-2 text-text">
                      <span className="font-bold text-good" aria-hidden>
                        +
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1.5 text-[14px]">
                  {l.score.cons.map((c) => (
                    <li key={c} className="flex gap-2 text-text">
                      <span className="font-bold text-bad" aria-hidden>
                        −
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Specs and links — reference material, so it sits quiet and last. */}
      <section className={`${ruled} mt-10`}>
        <h2 className={h2}>Vehicle details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-[14px] sm:grid-cols-3 lg:grid-cols-6">
          <Spec k="Body" v={modelInfo?.body} />
          <Spec k="Drivetrain" v={l.drivetrain !== "Unknown" ? l.drivetrain : null} />
          <Spec k="Engine" v={l.engine} />
          <Spec k="Transmission" v={l.transmission} />
          <Spec k="Fuel" v={l.fuelType} />
          <Spec k="Exterior" v={l.exteriorColour} />
          <Spec k="VIN" v={l.vin} mono />
          <Spec k="Certified pre-owned" v={l.cpo ? "Yes" : "No"} />
          <Spec k="CARFAX" v={l.carfaxAvailable ? "Available" : "Not stated"} />
          <Spec
            k="Accidents"
            v={l.accidentReported === false ? "None reported" : l.accidentReported === true ? "Reported" : "Unknown"}
          />
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          {externalLinks.map((link) => (
            <a
              key={link.url + link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost py-2 text-[13px]"
            >
              {link.label}
              <Icon name="external" size={14} />
            </a>
          ))}
        </div>
      </section>

      {alternatives.length > 0 && (
        <section className="mt-12">
          <h2 className={h2}>Similar cars worth a look</h2>
          <p className="mt-1 text-[14px] text-muted">Same shortlist, scored the same way.</p>
          <div className="row-list mt-4 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            {alternatives.map((a) => (
              <ListingRow key={a.id} listing={a} />
            ))}
          </div>
        </section>
      )}

      <CompareTray />
    </div>
  );
}

function CostBar({ label, value, max, index }: { label: string; value: number; max: number; index: number }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[14px]">
        <span className="text-muted">{label}</span>
        <span className="nums font-semibold text-text">{cad(value)}</span>
      </div>
      <FillBar percent={pct} delay={index * 0.08} height={6} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-line p-4 even:border-l sm:border-l sm:first:border-l-0 [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0 sm:p-5">
      <dt className="label">{label}</dt>
      <dd className="nums display mt-1.5 text-[22px] text-text">{value}</dd>
      {sub && <dd className="mt-1 truncate text-[13px] text-faint">{sub}</dd>}
    </div>
  );
}

function Spec({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="min-w-0">
      <dt className="label">{k}</dt>
      <dd className={`mt-0.5 break-words text-text ${mono ? "cond nums tracking-wide" : ""}`}>{v}</dd>
    </div>
  );
}
