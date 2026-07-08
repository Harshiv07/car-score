import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNewCars } from "../api/hooks";
import { NewCar } from "../api/types";
import { cad, ScoreBadge, timeAgo } from "../components/ui";

export function NewCarsPage() {
  const { data, isLoading } = useNewCars();
  const [params, setParams] = useSearchParams();
  const activeMake = params.get("make") ?? "";

  const byMake = useMemo(() => {
    const groups = new Map<string, NewCar[]>();
    for (const c of data?.cars ?? []) {
      (groups.get(c.make) ?? groups.set(c.make, []).get(c.make)!).push(c);
    }
    return [...groups.entries()];
  }, [data]);

  const visible = activeMake ? byMake.filter(([make]) => make === activeMake) : byMake;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="fade-up">
        <h1 className="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
          New <span className="text-brand">Cars</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Current-model lineups pulled straight from the manufacturers' official Canadian sites — starting MSRP,
          powertrain and specs. Click through to build &amp; price on the OEM site.
        </p>
      </div>

      {byMake.length > 0 && (
        <BrandTabs
          byMake={byMake}
          total={data?.cars.length ?? 0}
          active={activeMake}
          onChange={(make) =>
            setParams(make ? { make } : {}, { replace: true })
          }
        />
      )}

      {data?.loading && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/40 border-t-brand" />
          Loading more manufacturers…
        </div>
      )}

      {isLoading && !data && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      )}

      {visible.map(([make, cars]) => (
        <section key={make} className="mt-8">
          {!activeMake && (
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-text">
              {make}
              <span className="nums rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
                {cars.length}
              </span>
            </h2>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((c) => (
              <NewCarCard key={c.id} car={c} />
            ))}
          </div>
        </section>
      ))}

      {data && !data.loading && data.cars.length === 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-10 text-center text-muted">
          No new-car data available right now.
        </div>
      )}

      {activeMake && visible.length === 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-10 text-center text-muted">
          No {activeMake} models yet.
        </div>
      )}

      {data?.fetchedAt && (
        <p className="mt-8 text-center text-xs text-faint">
          Data from official manufacturer sites · updated {timeAgo(data.fetchedAt)}
        </p>
      )}
    </div>
  );
}

/** Horizontally-scrollable brand pill tabs, each showing a model count. */
function BrandTabs({
  byMake,
  total,
  active,
  onChange,
}: {
  byMake: [string, NewCar[]][];
  total: number;
  active: string;
  onChange: (make: string) => void;
}) {
  const pill = (isActive: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
      isActive ? "bg-brand text-black shadow-sm" : "bg-surface-2 text-muted hover:text-text"
    }`;
  return (
    <div role="tablist" aria-label="Filter by brand" className="mt-5 flex gap-2 overflow-x-auto pb-1">
      <button type="button" role="tab" aria-selected={!active} onClick={() => onChange("")} className={pill(!active)}>
        All <span className="nums opacity-70">({total})</span>
      </button>
      {byMake.map(([make, cars]) => (
        <button
          key={make}
          type="button"
          role="tab"
          aria-selected={active === make}
          onClick={() => onChange(make)}
          className={pill(active === make)}
        >
          {make} <span className="nums opacity-70">({cars.length})</span>
        </button>
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">
      {children}
    </span>
  );
}

function Spec({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 border-t border-line py-1.5 text-xs">
      <span className="shrink-0 text-faint">{label}</span>
      <span className="truncate text-right text-muted" title={value}>
        {value}
      </span>
    </div>
  );
}

/**
 * Model photo with graceful degradation: some OEM/wiki image URLs block
 * hotlinking or 404 later — on error we fall back to the make placeholder
 * instead of showing broken alt text over the card.
 */
function CarImage({ car }: { car: NewCar }) {
  const [failed, setFailed] = useState(false);
  if (!car.image || failed) {
    return (
      <div className="font-display grid h-full w-full place-items-center text-3xl font-bold text-line-strong">
        {car.make}
      </div>
    );
  }
  return (
    <img
      src={car.image}
      alt={`${car.year} ${car.make} ${car.model}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
    />
  );
}

function NewCarCard({ car }: { car: NewCar }) {
  return (
    <a
      href={car.officialUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-brand/40 hover:shadow-lg hover:shadow-black/20"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        <CarImage car={car} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {car.bodyType && <Chip>{car.bodyType}</Chip>}
          {car.fuelType && car.fuelType !== "Gas" && <Chip>{car.fuelType}</Chip>}
        </div>
        {car.score != null && (
          <div className="absolute right-3 top-3">
            <ScoreBadge total={car.score} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold text-text transition group-hover:text-brand">
          {car.year} {car.make} {car.model}
        </h3>

        <div className="mt-1.5">
          {car.startingPriceCad ? (
            <span className="nums text-lg font-extrabold text-text">
              {cad(car.startingPriceCad)}
              <span className="ml-1 text-xs font-medium text-faint">starting MSRP</span>
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted">See official site for pricing</span>
          )}
        </div>

        {car.description && <p className="mt-2 line-clamp-2 text-xs text-muted">{car.description}</p>}

        <div className="mt-3">
          <Spec label="Engine" value={car.engine} />
          <Spec label="Drivetrain" value={car.drivetrain} />
          <Spec label="Transmission" value={car.transmission} />
          <Spec label="Fuel tank" value={car.fuelCapacity} />
        </div>

        <div className="mt-auto pt-3 text-xs font-semibold text-brand">Build &amp; price on {car.source} ↗</div>
      </div>
    </a>
  );
}
