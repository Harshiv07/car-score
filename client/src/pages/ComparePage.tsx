import { useQueries } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api/client";
import { ListingDetailResponse } from "../api/types";
import { CarPhoto } from "../components/CarPhoto";
import { useCompare } from "../hooks/useCompare";
import { quickMonthly } from "../lib/finance";
import { ScoreStrip, round } from "../components/ScoreStrip";
import { Icon } from "../components/Icon";
import { scoreBand } from "../lib/whyLine";
import { cad, DealTag, km, scoreHex } from "../components/ui";

/**
 * Side-by-side comparison.
 *
 * A score out of 100 is only useful if you can see where the points came from,
 * and the honest way to choose between two similar cars is category by
 * category. Each row highlights the leader, so the trade-off — "cheaper, but
 * you give up winter capability" — is visible without arithmetic.
 */
export function ComparePage() {
  const [params] = useSearchParams();
  const { remove, clear } = useCompare();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 3);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["listing", id],
      queryFn: () => apiGet<ListingDetailResponse>(`/api/listings/${id}`),
      staleTime: 30_000,
    })),
  });

  const cars = results.map((r) => r.data?.listing).filter((l): l is NonNullable<typeof l> => !!l);
  const loading = results.some((r) => r.isLoading);

  if (ids.length === 0) {
    return (
      <Empty
        title="Nothing to compare yet."
        body="Pick two or three cars from the leaderboard with the compare button on each row."
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
        <div className="h-72 animate-pulse rounded-[var(--radius-card)] bg-surface" />
      </div>
    );
  }

  if (cars.length === 0) {
    return (
      <Empty
        title="These cars are no longer listed."
        body="Listings drop out of the inventory when a crawl no longer finds them. Pick fresh ones from the leaderboard."
      />
    );
  }

  // Category rows come from the first car; every listing is scored on the same
  // schedule, so the labels line up across columns.
  const categories = cars[0].score.breakdown;
  const best = (key: string) =>
    Math.max(...cars.map((c) => c.score.breakdown.find((b) => b.key === key)?.points ?? 0));

  const cheapest = Math.min(...cars.map((c) => c.price));
  const topScore = Math.max(...cars.map((c) => c.score.total));

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1 text-[14px] font-semibold text-muted hover:text-text">
          <Icon name="chevron-left" size={16} />
          Back to the leaderboard
        </Link>
        <button onClick={clear} className="link text-[14px]">
          Clear comparison
        </button>
      </div>

      <h1 className="display mt-4 text-[clamp(2rem,4vw,3rem)] text-text">Side by side</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] text-muted">
        The leader in each row is marked. The trade-off between two good cars usually lives in one or two categories,
        and this is where you'll see it.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed border-collapse">
          <caption className="sr-only">Score breakdown compared across selected cars</caption>
          <thead>
            <tr>
              <th scope="col" className="w-44 p-2 text-left align-bottom">
                <span className="sr-only">Category</span>
              </th>
              {cars.map((c) => (
                <th key={c.id} scope="col" className="p-2 text-left align-bottom font-normal">
                  <CarPhoto src={c.image} alt={c.title} ratio="4/3" width={480} sizes="260px" className="w-full rounded-[10px] border border-line" />
                  <div className="mt-3 flex items-end gap-2">
                    <span className="nums display text-[40px] leading-[0.85]" style={{ color: scoreHex(c.score.total) }}>
                      {Math.round(c.score.total)}
                    </span>
                    <span className="pb-0.5 text-[13px] font-semibold" style={{ color: scoreHex(c.score.total) }}>
                      {scoreBand(c.score.total)}
                      {c.score.total === topScore && cars.length > 1 && <span className="text-faint">, top score</span>}
                    </span>
                  </div>
                  <ScoreStrip breakdown={c.score.breakdown} className="mt-3" />
                  <Link to={`/listing/${c.id}`} className="wide mt-3 block text-[15px] font-bold leading-snug text-text hover:text-accent-ink">
                    {c.title}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                    <span className="nums display text-[20px] text-text">{cad(c.price)}</span>
                    {c.price === cheapest && cars.length > 1 && <span className="text-[12px] font-semibold text-good">Lowest price</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <DealTag rating={c.score.dealRating} />
                    <button onClick={() => remove(c.id)} className="text-[13px] font-semibold text-faint transition-colors hover:text-bad">
                      Remove
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <Row label="Monthly, estimated" cars={cars} render={(c) => `≈${cad(quickMonthly(c.price, c.province))}`} />
            <Row label="Mileage" cars={cars} render={(c) => (c.mileageKm != null ? km(c.mileageKm) : "n/a")} />
            <Row label="Year" cars={cars} render={(c) => String(c.year)} />
            <Row label="Drivetrain" cars={cars} render={(c) => (c.drivetrain === "Unknown" ? "Not stated" : c.drivetrain)} />
            <Row
              label="Against market"
              cars={cars}
              render={(c) =>
                c.score.market.savings > 0
                  ? `${cad(c.score.market.savings)} under`
                  : c.score.market.savings < 0
                    ? `${cad(-c.score.market.savings)} over`
                    : "At market"
              }
            />

            <tr>
              <td colSpan={cars.length + 1} className="pb-2 pt-8">
                <h2 className="wide text-[19px] font-bold text-text">Score by category</h2>
              </td>
            </tr>

            {categories.map((cat) => {
              const leader = best(cat.key);
              const tie = cars.every((o) => (o.score.breakdown.find((b) => b.key === cat.key)?.points ?? 0) === leader);
              return (
                <tr key={cat.key} className="border-t border-line">
                  <th scope="row" className="py-3 pr-3 text-left text-[14px] font-semibold text-text">
                    {cat.label}
                    <span className="ml-1 font-normal text-faint">of {cat.max}</span>
                  </th>
                  {cars.map((c) => {
                    const cell = c.score.breakdown.find((b) => b.key === cat.key);
                    const pts = cell?.points ?? 0;
                    const wins = cars.length > 1 && pts === leader && leader > 0 && !tie;
                    const weak = cat.max > 0 && pts / cat.max < 0.5;
                    return (
                      <td key={c.id} className="px-2 py-3">
                        <span
                          className={`nums inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[15px] font-bold ${
                            wins ? "bg-good/12 text-good" : weak ? "text-bad" : "text-text"
                          }`}
                        >
                          {round(pts)}
                          {wins && <span className="text-[12px] font-semibold">leads</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row<T extends { id: string }>({
  label,
  cars,
  render,
}: {
  label: string;
  cars: T[];
  render: (c: T) => string;
}) {
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-3 pr-3 text-left text-[14px] font-semibold text-text">
        {label}
      </th>
      {cars.map((c) => (
        <td key={c.id} className="nums px-2 py-3 text-[14px] text-muted">
          {render(c)}
        </td>
      ))}
    </tr>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="wide text-[24px] font-bold text-text">{title}</p>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <Link to="/" className="btn btn-primary mt-6">
        Back to the leaderboard
      </Link>
    </div>
  );
}
