import { Link, useParams } from "react-router-dom";
import { useListingDetail } from "../api/hooks";
import { ListingCard } from "../components/ListingCard";
import { Badge, cad, DealPill, isRecent, km, NewBadge, ScoreGauge, Stars, timeAgo } from "../components/ui";

const SEVERITY_STYLES: Record<string, string> = {
  major: "text-bad",
  moderate: "text-brand",
  minor: "text-faint",
};

const section = "rounded-2xl border border-line bg-surface p-5";
const h2 = "text-xs font-bold uppercase tracking-wider text-faint mb-3.5";

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useListingDetail(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-64 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-center">
        <p className="text-muted">Listing not found.</p>
        <Link to="/" className="mt-2 inline-block font-semibold text-brand hover:text-brand-strong">
          ← Back to leaderboard
        </Link>
      </div>
    );
  }

  const { listing: l, ownership, modelInfo, alternatives, externalLinks } = data;
  const { market } = l.score;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 fade-up">
      <Link to="/" className="text-sm font-semibold text-brand hover:text-brand-strong">
        ← Back to leaderboard
      </Link>

      {/* Header */}
      <div className={`mt-3 ${section}`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <ScoreGauge total={l.score.total} size={150} />
            <div className="mt-1 text-center text-xs text-faint">out of 100</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-text">{l.title}</h1>
              <DealPill rating={l.score.dealRating} />
              {isRecent(l.firstSeenAt) && <NewBadge />}
            </div>
            <p className="mt-1.5 text-sm text-muted">
              {l.dealer ? `${l.dealer} · ` : ""}
              {l.city ? `${l.city}${l.province ? `, ${l.province}` : ""} · ` : ""}
              via {l.sourceWebsite}
              {" · "}
              <span title={new Date(l.firstSeenAt).toLocaleString()}>added {timeAgo(l.firstSeenAt)}</span>
            </p>
            {l.badges.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {l.badges.map((b) => (
                  <Badge key={b} label={b} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Market comparison strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Asking price" value={cad(market.listingPrice)} />
          <Stat
            label="Market price"
            value={cad(market.marketPrice)}
            sub={market.method === "comparables" ? `${market.sampleSize} comparables` : "model baseline"}
          />
          <Stat
            label={market.savings >= 0 ? "Savings" : "Premium"}
            value={cad(Math.abs(market.savings))}
            tone={market.savings >= 0 ? "good" : "bad"}
          />
          <Stat label="Mileage" value={l.mileageKm != null ? km(l.mileageKm) : "n/a"} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Score breakdown */}
        <div className={section}>
          <h2 className={h2}>Why this score</h2>
          <div className="space-y-3">
            {l.score.breakdown.map((c) => {
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
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${fill}`} style={{ width: `${frac * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{c.detail}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* Ownership estimate as bars */}
          {ownership && (
            <div className={section}>
              <h2 className={h2}>Estimated annual ownership</h2>
              <OwnershipBar label="Fuel" value={ownership.fuelAnnual} max={ownership.totalAnnual} />
              <OwnershipBar label="Insurance" value={ownership.insuranceAnnual} max={ownership.totalAnnual} />
              <OwnershipBar label="Maintenance" value={ownership.maintenanceAnnual} max={ownership.totalAnnual} />
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm font-bold text-text">Total / year</span>
                <span className="nums text-lg font-extrabold text-brand">{cad(ownership.totalAnnual)}</span>
              </div>
              <p className="mt-2 text-xs text-faint">
                Assumes {ownership.assumptions.kmPerYear.toLocaleString()} km/yr at ${ownership.assumptions.fuelPriceCadPerL}/L.
                Insurance varies by driver.
              </p>
            </div>
          )}

          {/* Known issues */}
          {modelInfo && modelInfo.knownIssues.length > 0 && (
            <div className={section}>
              <h2 className={h2}>Known issues & recall history</h2>
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
            </div>
          )}

          {/* Pros / cons */}
          <div className={section}>
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

      {/* Vehicle specs */}
      <div className={`mt-4 ${section}`}>
        <h2 className={h2}>Vehicle</h2>
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
        </dl>
      </div>

      {/* External links */}
      <div className={`mt-4 ${section}`}>
        <h2 className={h2}>External links</h2>
        <div className="flex flex-wrap gap-2">
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

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-text">Nearby alternatives</h2>
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

function OwnershipBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="nums font-semibold text-text">{cad(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div className="rounded-xl bg-surface-2 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</div>
      <div className={`nums mt-1 text-lg font-extrabold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function Spec({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  if (!v) return null;
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{k}</dt>
      <dd className={`text-text ${mono ? "nums text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
