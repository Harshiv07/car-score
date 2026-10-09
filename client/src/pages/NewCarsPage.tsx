import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useNewCars } from "../api/hooks";
import { NewCar } from "../api/types";
import { cad, ScoreChip } from "../components/ui";
import { Icon } from "../components/Icon";
import { WakingNotice } from "../components/WakingNotice";

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
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-8 sm:px-6 sm:pt-12">
      <div>
        <h1 className="display text-[clamp(2.25rem,5vw,3.75rem)] text-text">New cars</h1>
        <p className="mt-3 max-w-[58ch] text-[16px] leading-relaxed text-muted">
          This year's lineups from the manufacturers' Canadian sites: starting MSRP, powertrain and specs. Worth a
          look before you settle on used, because a new car's warranty and financing rates can close more of the
          price gap than you'd expect.
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

      <div className="mt-5">
        <WakingNotice active={isLoading && !data} />
      </div>

      {data?.loading && (
        <div className="mt-5 flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2.5 text-sm text-muted">
          <span className="spin h-3.5 w-3.5 rounded-full border-2 border-line border-t-accent" />
          Loading more manufacturers…
        </div>
      )}

      {isLoading && !data && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-[var(--radius-card)] bg-surface" />
          ))}
        </div>
      )}

      {visible.map(([make, cars]) => (
        <section key={make} className="mt-10">
          {!activeMake && (
            <h2 className="mb-4 flex items-baseline gap-2 border-b border-line pb-2">
              <span className="wide text-[22px] font-bold text-text">{make}</span>
              <span className="nums text-[14px] text-faint">
                {cars.length} model{cars.length === 1 ? "" : "s"}
              </span>
            </h2>
          )}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((c) => (
              <NewCarCard key={c.id} car={c} />
            ))}
          </div>
        </section>
      ))}

      {data && !data.loading && data.cars.length === 0 && (
        <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line-strong p-10 text-center text-muted">
          No new-car data right now. The manufacturer sites may be slow; try again in a few minutes.
        </div>
      )}

      {activeMake && visible.length === 0 && (
        <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line-strong p-10 text-center text-muted">
          No {activeMake} models yet.
        </div>
      )}

      {data?.pricesAsOf && (
        <p className="mt-10 text-center text-[13px] text-faint">
          Prices as of {new Date(`${data.pricesAsOf}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" })}.{" "}
          {data.priceNote ?? "MSRP in CAD, before freight, PDI and taxes."}
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
    `relative shrink-0 px-3 py-2.5 text-[14px] font-semibold transition-colors ${
      isActive ? "text-text after:absolute after:inset-x-3 after:-bottom-px after:h-[2px] after:rounded-full after:bg-accent" : "text-muted hover:text-text"
    }`;
  return (
    <div role="tablist" aria-label="Filter by brand" className="mt-8 flex overflow-x-auto border-b border-line">
      <button type="button" role="tab" aria-selected={!active} onClick={() => onChange("")} className={pill(!active)}>
        All <span className="nums font-normal text-faint">({total})</span>
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
          {make} <span className="nums font-normal text-faint">({cars.length})</span>
        </button>
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface/92 px-2 py-0.5 text-[12px] font-semibold text-text backdrop-blur-sm">
      {children}
    </span>
  );
}

function Spec({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 border-t border-line py-2 text-[13px]">
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
      <div className="display grid h-full w-full place-items-center text-[28px] text-line-strong">
        {car.make}
      </div>
    );
  }
  return (
    <>
      <img
        src={car.image}
        alt={`${car.year} ${car.make} ${car.model}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
      />
      {/* Scrim: these are stock photos we don't control, and a white car on a
          bright sky left the chips over it unreadable. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-20"
        style={{ background: "linear-gradient(to bottom, rgb(0 0 0 / 0.4), transparent)" }}
        aria-hidden
      />
    </>
  );
}

function NewCarCard({ car }: { car: NewCar }) {
  return (
    <a
      href={car.officialUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition-colors hover:border-line-strong"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface2">
        <CarImage car={car} />

        <div className="absolute left-3 top-3 flex gap-1.5">
          {car.bodyType && <Chip>{car.bodyType}</Chip>}
          {car.fuelType && car.fuelType !== "Gas" && <Chip>{car.fuelType}</Chip>}
        </div>
        {car.score != null && (
          <div className="absolute right-3 top-3">
            <ScoreChip total={car.score} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="wide text-[17px] font-bold text-text">
          {car.year} {car.make} {car.model}
        </h3>

        <div className="mt-1.5">
          {car.startingPriceCad ? (
            <span className="nums display text-[22px] text-text">
              {cad(car.startingPriceCad)}
              <span className="ml-1.5 text-[13px] font-medium text-faint" style={{ fontStretch: "100%", letterSpacing: 0 }}>
                starting MSRP
              </span>
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted">See official site for pricing</span>
          )}
        </div>

        {car.description && <p className="mt-2 line-clamp-2 text-[14px] text-muted">{car.description}</p>}

        <div className="mt-3">
          <Spec label="Engine" value={car.engine} />
          <Spec label="Drivetrain" value={car.drivetrain} />
          <Spec label="Transmission" value={car.transmission} />
          <Spec label="Fuel tank" value={car.fuelCapacity} />
        </div>

        <div className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[14px] font-semibold text-accent-ink">
          Build and price on {car.source}
          <Icon name="external" size={14} />
        </div>
      </div>
    </a>
  );
}
