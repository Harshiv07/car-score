import { Link, useParams } from "react-router-dom";
import { useListingDetail } from "../api/hooks";
import { ListingCard } from "../components/ListingCard";
import { Badge, cad, DealPill, km, scoreColor, Stars } from "../components/ui";

const SEVERITY_STYLES: Record<string, string> = {
  major: "text-red-600 dark:text-red-400",
  moderate: "text-amber-600 dark:text-amber-400",
  minor: "text-slate-500 dark:text-slate-400",
};

export function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useListingDetail(id);

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10"><div className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" /></div>;
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-center">
        <p className="text-slate-500 dark:text-slate-400">Listing not found.</p>
        <Link to="/" className="mt-2 inline-block font-semibold text-cyan-600 hover:underline dark:text-cyan-400">← Back to leaderboard</Link>
      </div>
    );
  }

  const { listing: l, ownership, modelInfo, alternatives, externalLinks } = data;
  const { market } = l.score;

  const section = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
  const h2 = "text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/" className="text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
        ← Back to leaderboard
      </Link>

      {/* Header */}
      <div className={`mt-3 ${section}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{l.title}</h1>
              <DealPill rating={l.score.dealRating} />
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {l.dealer ? `${l.dealer} · ` : ""}
              {l.city ? `${l.city}${l.province ? `, ${l.province}` : ""} · ` : ""}
              via {l.sourceWebsite}
            </p>
            {l.badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">{l.badges.map((b) => <Badge key={b} label={b} />)}</div>
            )}
          </div>
          <div className="text-right">
            <div className={`font-mono text-5xl font-extrabold ${scoreColor(l.score.total)}`}>
              {Math.round(l.score.total)}
              <span className="text-lg text-slate-400 dark:text-slate-500">/100</span>
            </div>
          </div>
        </div>

        {/* Market comparison strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Asking price" value={cad(market.listingPrice)} />
          <Stat label="Market price" value={cad(market.marketPrice)} sub={market.method === "comparables" ? `${market.sampleSize} comparables` : "model baseline"} />
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
          <div className="space-y-2.5">
            {l.score.breakdown.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{c.label}</span>
                  <span className="flex items-center gap-2">
                    <Stars value={c.stars} className="text-xs" />
                    <span className="w-14 text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                      {c.points}/{c.max}
                    </span>
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-cyan-500" style={{ width: `${(c.points / c.max) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Specs */}
          <div className={section}>
            <h2 className={h2}>Vehicle</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Spec k="Body" v={modelInfo?.body} />
              <Spec k="Drivetrain" v={l.drivetrain} />
              <Spec k="Engine" v={l.engine} />
              <Spec k="Transmission" v={l.transmission} />
              <Spec k="Fuel type" v={l.fuelType} />
              <Spec k="Exterior" v={l.exteriorColour} />
              <Spec k="VIN" v={l.vin} mono />
              <Spec k="CPO" v={l.cpo ? "Yes" : "No"} />
              <Spec k="CARFAX" v={l.carfaxAvailable ? "Available" : "Not stated"} />
              <Spec k="Accidents" v={l.accidentReported === false ? "None reported" : l.accidentReported === true ? "Reported" : "Unknown"} />
              {l.warrantyNote && <Spec k="Warranty" v={l.warrantyNote} wide />}
            </dl>
          </div>

          {/* Ownership estimate */}
          {ownership && (
            <div className={section}>
              <h2 className={h2}>Estimated annual ownership</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Fuel" value={cad(ownership.fuelAnnual)} />
                <Stat label="Insurance" value={cad(ownership.insuranceAnnual)} />
                <Stat label="Maintenance" value={cad(ownership.maintenanceAnnual)} />
                <Stat label="Total / yr" value={cad(ownership.totalAnnual)} tone="accent" />
              </div>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Assumes {ownership.assumptions.kmPerYear.toLocaleString()} km/yr at ${ownership.assumptions.fuelPriceCadPerL}/L. Insurance varies by driver.
              </p>
            </div>
          )}

          {/* Known issues */}
          {modelInfo && modelInfo.knownIssues.length > 0 && (
            <div className={section}>
              <h2 className={h2}>Known issues & recall history</h2>
              <ul className="space-y-1.5 text-sm">
                {modelInfo.knownIssues.map((i) => (
                  <li key={i.title} className="flex gap-2">
                    <span className={`font-bold ${SEVERITY_STYLES[i.severity]}`}>•</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {i.title}
                      {i.note && <span className="text-slate-500 dark:text-slate-400"> — {i.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Pros / cons */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={section}>
          <h2 className={h2}>Pros</h2>
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {l.score.pros.map((p) => (
              <li key={p} className="flex gap-2"><span className="font-bold text-emerald-500">•</span>{p}</li>
            ))}
          </ul>
        </div>
        <div className={section}>
          <h2 className={h2}>Cons</h2>
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {l.score.cons.map((c) => (
              <li key={c} className="flex gap-2"><span className="font-bold text-amber-500">•</span>{c}</li>
            ))}
          </ul>
        </div>
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
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-cyan-700 hover:border-cyan-500 hover:bg-cyan-50 dark:border-slate-700 dark:text-cyan-400 dark:hover:bg-slate-800"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      </div>

      {/* Alternatives */}
      {alternatives.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Nearby alternatives</h2>
          <div className="space-y-3">
            {alternatives.map((a, i) => (
              <ListingCard key={a.id} listing={a} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "accent" }) {
  const color =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "accent"
          ? "text-cyan-700 dark:text-cyan-400"
          : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  );
}

function Spec({ k, v, mono, wide }: { k: string; v: string | null | undefined; mono?: boolean; wide?: boolean }) {
  if (!v) return null;
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{k}</dt>
      <dd className={`text-slate-700 dark:text-slate-200 ${mono ? "font-mono text-xs" : ""}`}>{v}</dd>
    </div>
  );
}
