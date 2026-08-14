import { Link, useParams } from "react-router-dom";
import { useListingDetail } from "../api/hooks";
import { ListingCard } from "../components/ListingCard";
import { CarPhoto } from "../components/CarPhoto";
import { PaymentEstimate } from "../components/PaymentEstimate";
import { AnimatedNumber, FillBar } from "../components/motion";
import { useFavorites } from "../hooks/useFavorites";
import { whyLine, scoreBand, kmPerYear } from "../lib/whyLine";
import { Badge, cad, DealPill, isRecent, km, NewBadge, scoreHex, Stars, timeAgo } from "../components/ui";

const SEVERITY_STYLES: Record<string, string> = {
  major: "text-bad",
  moderate: "text-warn",
  minor: "text-faint",
};

const card = "rounded-2xl border border-line bg-surface p-5";
const h2 = "text-xs font-bold uppercase tracking-wider text-faint mb-3.5";

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useListingDetail(id);
  const { isFavorite, toggle } = useFavorites();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-96 animate-pulse rounded-3xl bg-surface" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="font-display text-xl font-bold text-text">This listing is gone.</p>
        <p className="mt-2 text-sm text-muted">
          Cars drop out of the inventory when a scrape no longer finds them — usually because they sold.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold transition hover:bg-brand-strong"
          style={{ color: "var(--on-brand)" }}
        >
          Back to leaderboard
        </Link>
      </div>
    );
  }

  const { listing: l, ownership, recallHistory, modelInfo, alternatives, externalLinks } = data;
  const { market } = l.score;
  const fav = isFavorite(l.dedupeKey);
  const perYear = kmPerYear(l);
  const original = externalLinks.find((x) => x.label === "Original listing");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 fade-up">
      <Link to="/" className="text-sm font-semibold text-brand hover:text-brand-strong">
        ← Back to leaderboard
      </Link>

      {/* Hero: photo and the verdict, side by side. */}
      <div className="mt-3 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <CarPhoto
          src={l.image}
          alt={l.title}
          ratio="4/3"
          width={1024}
          priority
          sizes="(max-width: 1024px) 100vw, 620px"
          className="w-full rounded-3xl border border-line"
        />

        <div className="flex flex-col justify-center">
          <div className="flex flex-wrap items-center gap-2">
            <DealPill rating={l.score.dealRating} />
            {l.cpo && <Badge label="CPO" />}
            {isRecent(l.firstSeenAt) && <NewBadge />}
          </div>

          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-text">
            {l.title}
          </h1>

          <p className="mt-1.5 text-sm text-muted">
            {[l.dealer, l.city && `${l.city}${l.province ? `, ${l.province}` : ""}`].filter(Boolean).join(" · ") ||
              "Private / aggregator listing"}
            {" · via "}
            {l.sourceWebsite}
          </p>

          {/* Score, stated as a verdict rather than a chip. It counts up on
              arrival — the number is a measurement, and watching it settle says
              so more honestly than printing it fully formed. */}
          <div className="mt-5 flex items-end gap-4 border-y border-line py-4">
            <div className="leading-none">
              <AnimatedNumber
                value={l.score.total}
                className="nums font-display text-6xl font-extrabold"
                style={{ color: scoreHex(l.score.total) }}
              />
              <span className="ml-1 text-sm font-bold text-faint">/100</span>
            </div>
            <div className="pb-1">
              <div
                className="text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ color: scoreHex(l.score.total) }}
              >
                {scoreBand(l.score.total)}
              </div>
              <p className="mt-1 max-w-xs text-[13px] leading-snug text-muted">{whyLine(l)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="nums font-display text-3xl font-extrabold text-text">{cad(l.price)}</span>
            {market.savings > 0 ? (
              <span className="nums text-sm font-semibold text-good">{cad(market.savings)} under market</span>
            ) : market.savings < -500 ? (
              <span className="nums text-sm font-semibold text-bad">{cad(-market.savings)} over market</span>
            ) : (
              <span className="text-sm text-muted">priced at market</span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {original && (
              <a
                href={original.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold transition hover:bg-brand-strong"
                style={{ color: "var(--on-brand)" }}
              >
                View on {l.sourceWebsite} ↗
              </a>
            )}
            <button
              onClick={() => toggle(l.dedupeKey)}
              aria-pressed={fav}
              className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                fav ? "border-bad/40 bg-bad/10 text-bad" : "border-line text-text hover:border-line-strong"
              }`}
            >
              {fav ? "♥ Saved" : "♡ Save this car"}
            </button>
          </div>
        </div>
      </div>

      {/* Key numbers */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mileage" value={l.mileageKm != null ? km(l.mileageKm) : "n/a"} sub={perYear ? `${perYear.toLocaleString("en-CA")} km/yr` : undefined} />
        <Stat
          label="Market price"
          value={cad(market.marketPrice)}
          sub={market.method === "comparables" ? `${market.sampleSize} comparables` : "model baseline"}
        />
        <Stat label="Year" value={String(l.year)} sub={l.drivetrain !== "Unknown" ? l.drivetrain : undefined} />
        <Stat
          label="Running cost"
          value={ownership ? cad(ownership.totalAnnual) : "—"}
          sub="per year, estimated"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Score breakdown — the reason anyone is on this page. */}
        <div className={card}>
          <h2 className={h2}>Why this score</h2>
          {/* The bars fill in sequence rather than all at once: the total
              visibly assembles from its categories, which is the one thing this
              panel exists to explain. The stagger is capped so the last bar
              isn't left waiting. */}
          <div className="space-y-3">
            {l.score.breakdown.map((c, i) => {
              const frac = c.max ? c.points / c.max : 0;
              const fill = frac >= 0.75 ? "bg-good" : frac >= 0.5 ? "bg-brand" : "bg-bad";
              return (
                <div key={c.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-text">{c.label}</span>
                    <span className="flex items-center gap-2">
                      <Stars value={c.stars} className="text-xs" />
                      <span className="nums w-14 text-right text-xs text-muted">
                        {c.points}/{c.max}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1">
                    <FillBar percent={frac * 100} className={fill} delay={Math.min(i * 0.06, 0.5)} height={6} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{c.detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* What it costs per month — the number this audience decides on. */}
          <div className={card}>
            <h2 className={h2}>What you'd pay monthly</h2>
            <PaymentEstimate price={l.price} province={l.province} />
          </div>

          {ownership && (
            <div className={card}>
              <h2 className={h2}>Running costs, per year</h2>
              <OwnershipBar label="Fuel" value={ownership.fuelAnnual} max={ownership.totalAnnual} index={0} />
              <OwnershipBar label="Insurance" value={ownership.insuranceAnnual} max={ownership.totalAnnual} index={1} />
              <OwnershipBar label="Maintenance" value={ownership.maintenanceAnnual} max={ownership.totalAnnual} index={2} />
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm font-bold text-text">Total / year</span>
                <span className="nums text-lg font-extrabold text-brand">{cad(ownership.totalAnnual)}</span>
              </div>
              <p className="mt-2 text-xs text-faint">
                Assumes {ownership.assumptions.kmPerYear.toLocaleString()} km/yr at $
                {ownership.assumptions.fuelPriceCadPerL}/L. Insurance is based on {ownership.assumptions.insuranceProvince}{" "}
                averages and varies by driver.
              </p>
            </div>
          )}

          {((modelInfo && modelInfo.knownIssues.length > 0) || recallHistory.length > 0) && (
            <div className={card}>
              <h2 className={h2}>Known issues &amp; recalls</h2>

              {modelInfo && modelInfo.knownIssues.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {modelInfo.knownIssues.map((i) => (
                    <li key={i.title} className="flex gap-2">
                      <span className={`font-bold ${SEVERITY_STYLES[i.severity]}`}>•</span>
                      <span className="text-text">
                        {i.title}
                        {i.note && <span className="text-muted"> — {i.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {recallHistory.length > 0 && (
                <div className={modelInfo && modelInfo.knownIssues.length > 0 ? "mt-4 border-t border-line pt-4" : ""}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">
                    {recallHistory.length} recall{recallHistory.length === 1 ? "" : "s"} on file for {l.year}{" "}
                    {l.make} {l.model}
                  </p>
                  <ul className="space-y-2.5 text-sm">
                    {recallHistory.map((r) => (
                      <li key={r.recallNumber} className="flex gap-2">
                        <span className="font-bold text-warn">•</span>
                        <span className="text-text">
                          {r.summary}
                          <span className="ml-1.5 whitespace-nowrap text-xs text-faint">
                            (#{r.recallNumber}, {r.date})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-3 text-xs text-faint">
                {recallHistory.length > 0
                  ? "This is every recall Transport Canada has issued for this model year, not this specific car — it doesn't say whether this VIN's recalls were completed. Ask the dealer, or check with the manufacturer using the VIN."
                  : "Model-level patterns, not this specific car. Confirm open recalls by VIN before you buy."}
              </p>
            </div>
          )}

          <div className={card}>
            <h2 className={h2}>Pros &amp; cons</h2>
            <ul className="space-y-1.5 text-sm">
              {l.score.pros.map((p) => (
                <li key={p} className="flex gap-2 text-text">
                  <span className="font-bold text-good">+</span>
                  {p}
                </li>
              ))}
              {l.score.cons.map((c) => (
                <li key={c} className="flex gap-2 text-text">
                  <span className="font-bold text-bad">–</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Specs and links — reference material, so it sits quiet and last. */}
      <div className={`mt-4 ${card}`}>
        <h2 className={h2}>Vehicle details</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <Spec k="Body" v={modelInfo?.body} />
          <Spec k="Drivetrain" v={l.drivetrain} />
          <Spec k="Engine" v={l.engine} />
          <Spec k="Transmission" v={l.transmission} />
          <Spec k="Fuel type" v={l.fuelType} />
          <Spec k="Exterior" v={l.exteriorColour} />
          <Spec k="VIN" v={l.vin} mono />
          <Spec k="CPO" v={l.cpo ? "Yes" : "No"} />
          <Spec k="CARFAX" v={l.carfaxAvailable ? "Available" : "Not stated"} />
          <Spec
            k="Accidents"
            v={l.accidentReported === false ? "None reported" : l.accidentReported === true ? "Reported" : "Unknown"}
          />
          <Spec k="First seen" v={timeAgo(l.firstSeenAt)} />
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {externalLinks.map((link) => (
            <a
              key={link.url + link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-brand transition hover:border-brand/50 hover:bg-brand/10"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>

      {alternatives.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 font-display text-lg font-bold text-text">Similar cars worth checking</h2>
          <p className="mb-3 text-sm text-muted">Same shortlist, scored the same way.</p>
          <div className="space-y-3">
            {alternatives.map((a) => (
              <ListingCard key={a.id} listing={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OwnershipBar({ label, value, max, index = 0 }: { label: string; value: number; max: number; index?: number }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="nums font-semibold text-text">{cad(value)}</span>
      </div>
      <FillBar percent={pct} className="bg-info" delay={index * 0.08} height={8} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className="nums font-display mt-1 text-xl font-extrabold text-text">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function Spec({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{k}</dt>
      <dd className={`text-text ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
