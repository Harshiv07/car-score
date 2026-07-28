import { useQueries } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api/client";
import { ListingDetailResponse } from "../api/types";
import { CarPhoto } from "../components/CarPhoto";
import { useCompare } from "../hooks/useCompare";
import { quickMonthly } from "../lib/finance";
import { cad, DealPill, km, scoreHex, Stars } from "../components/ui";

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
        body="Pick two or three cars from the leaderboard using the ⇄ button on each card."
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-72 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  if (cars.length === 0) {
    return (
      <Empty
        title="These cars are no longer listed."
        body="Listings drop out of the inventory when a scrape no longer finds them. Pick fresh ones from the leaderboard."
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
    <div className="mx-auto max-w-6xl px-4 py-6 fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm font-semibold text-brand hover:text-brand-strong">
          ← Back to leaderboard
        </Link>
        <button onClick={clear} className="text-sm font-semibold text-muted transition hover:text-text">
          Clear comparison
        </button>
      </div>

      <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-text sm:text-3xl">
        Comparing {cars.length} cars
      </h1>

      <div className="mt-5 overflow-x-auto">
        {/* table-fixed keeps every car's column the same width regardless of
            photo or title length, so the rows actually line up for comparison. */}
        <table className="w-full min-w-[640px] table-fixed border-collapse">
          <caption className="sr-only">Score breakdown compared across selected cars</caption>
          <thead>
            <tr>
              <th scope="col" className="w-40 p-2 text-left align-bottom">
                <span className="sr-only">Category</span>
              </th>
              {cars.map((c) => (
                <th key={c.id} scope="col" className="p-2 align-bottom">
                  <div className="rounded-2xl border border-line bg-surface p-3 text-left">
                    <CarPhoto
                      src={c.image}
                      alt={c.title}
                      ratio="4/3"
                      width={480}
                      sizes="200px"
                      className="mb-3 w-full rounded-xl"
                    />
                    <div className="flex items-baseline gap-2">
                      <span
                        className="nums font-display text-2xl font-extrabold"
                        style={{ color: scoreHex(c.score.total) }}
                      >
                        {Math.round(c.score.total)}
                      </span>
                      {c.score.total === topScore && cars.length > 1 && (
                        <span className="rounded-full bg-good/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-good">
                          Top score
                        </span>
                      )}
                    </div>
                    <Link
                      to={`/listing/${c.id}`}
                      className="mt-1 block text-sm font-bold leading-snug text-text hover:text-brand"
                    >
                      {c.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                      <span className="nums text-base font-extrabold text-text">{cad(c.price)}</span>
                      {c.price === cheapest && cars.length > 1 && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-good">Lowest price</span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <DealPill rating={c.score.dealRating} />
                    </div>
                    <button
                      onClick={() => remove(c.id)}
                      className="mt-3 text-xs font-semibold text-faint transition hover:text-bad"
                    >
                      Remove
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            <Row label="Monthly (est.)" cars={cars} render={(c) => `≈${cad(quickMonthly(c.price, c.province))}`} />
            <Row label="Mileage" cars={cars} render={(c) => (c.mileageKm != null ? km(c.mileageKm) : "—")} />
            <Row label="Year" cars={cars} render={(c) => String(c.year)} />
            <Row label="Drivetrain" cars={cars} render={(c) => c.drivetrain} />
            <Row
              label="vs market"
              cars={cars}
              render={(c) =>
                c.score.market.savings > 0
                  ? `${cad(c.score.market.savings)} under`
                  : c.score.market.savings < 0
                    ? `${cad(-c.score.market.savings)} over`
                    : "at market"
              }
            />

            <tr>
              <td colSpan={cars.length + 1} className="pt-6 pb-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-faint">Score breakdown</h2>
              </td>
            </tr>

            {categories.map((cat) => {
              const leader = best(cat.key);
              return (
                <tr key={cat.key} className="border-t border-line">
                  <th scope="row" className="py-2.5 pr-3 text-left text-sm font-semibold text-text">
                    {cat.label}
                    <span className="ml-1 text-xs font-normal text-faint">/{cat.max}</span>
                  </th>
                  {cars.map((c) => {
                    const cell = c.score.breakdown.find((b) => b.key === cat.key);
                    const pts = cell?.points ?? 0;
                    // Only call something a winner when it actually leads.
                    const wins = cars.length > 1 && pts === leader && leader > 0 && !cars.every((o) => (o.score.breakdown.find((b) => b.key === cat.key)?.points ?? 0) === leader);
                    return (
                      <td key={c.id} className="px-2 py-2.5 text-center">
                        <div
                          className={`inline-flex flex-col items-center rounded-lg px-3 py-1.5 ${
                            wins ? "bg-good/10 ring-1 ring-good/25" : ""
                          }`}
                        >
                          <span className={`nums text-sm font-bold ${wins ? "text-good" : "text-text"}`}>{pts}</span>
                          <Stars value={cell?.stars ?? 0} className="text-[10px]" />
                        </div>
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
      <th scope="row" className="py-2.5 pr-3 text-left text-sm font-semibold text-text">
        {label}
      </th>
      {cars.map((c) => (
        <td key={c.id} className="nums px-2 py-2.5 text-center text-sm text-muted">
          {render(c)}
        </td>
      ))}
    </tr>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="font-display text-xl font-bold text-text">{title}</p>
      <p className="mt-2 text-sm text-muted">{body}</p>
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
