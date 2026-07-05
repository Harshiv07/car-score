import { MetaResponse } from "../api/types";
import { Segmented, Toggle, cad, km } from "./ui";

const PRICE_MAX = 60000;
const MILEAGE_MAX = 200000;

/**
 * All filters write straight into URL search params (shareable, survives
 * reload). `onChange(key, value)` sets or clears one param.
 */
export function FiltersSidebar({
  meta,
  params,
  onChange,
  onClear,
}: {
  meta: MetaResponse | undefined;
  params: URLSearchParams;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const get = (k: string) => params.get(k) ?? "";
  const models = meta?.models.filter((m) => !get("make") || m.make === get("make")) ?? [];
  const activeCount = [...params.keys()].filter((k) => !["sort", "page", "pageSize"].includes(k)).length;

  const label = "block text-[11px] font-semibold uppercase tracking-wide text-faint mb-1.5";
  const input =
    "w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-sm text-text placeholder:text-faint focus:border-brand";
  const row = "grid grid-cols-2 gap-2";

  const priceMax = Number(get("priceMax")) || PRICE_MAX;
  const mileageMax = Number(get("mileageMax")) || MILEAGE_MAX;

  return (
    <aside className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
          <span className="h-2 w-2 rounded-full bg-brand" /> Filters
        </h2>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-xs font-semibold text-brand hover:text-brand-strong">
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {/* Max price slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Max price</span>
          <span className="nums text-xs font-semibold text-text">
            {priceMax >= PRICE_MAX ? "Any" : cad(priceMax)}
          </span>
        </div>
        <input
          type="range"
          className="range"
          min={5000}
          max={PRICE_MAX}
          step={1000}
          value={priceMax}
          style={{ ["--pct" as string]: `${((priceMax - 5000) / (PRICE_MAX - 5000)) * 100}%` }}
          onChange={(e) => onChange("priceMax", Number(e.target.value) >= PRICE_MAX ? "" : e.target.value)}
          aria-label="Maximum price"
        />
      </div>

      {/* Max mileage slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Max mileage</span>
          <span className="nums text-xs font-semibold text-text">
            {mileageMax >= MILEAGE_MAX ? "Any" : km(mileageMax)}
          </span>
        </div>
        <input
          type="range"
          className="range"
          min={20000}
          max={MILEAGE_MAX}
          step={5000}
          value={mileageMax}
          style={{ ["--pct" as string]: `${((mileageMax - 20000) / (MILEAGE_MAX - 20000)) * 100}%` }}
          onChange={(e) => onChange("mileageMax", Number(e.target.value) >= MILEAGE_MAX ? "" : e.target.value)}
          aria-label="Maximum mileage"
        />
      </div>

      {/* Drivetrain segmented */}
      <div>
        <span className={label}>Drivetrain</span>
        <Segmented
          ariaLabel="Drivetrain"
          value={get("drivetrain") || "All"}
          onChange={(v) => onChange("drivetrain", v === "All" ? "" : v)}
          options={[
            { value: "All", label: "All" },
            { value: "AWD", label: "AWD" },
            { value: "FWD", label: "FWD" },
          ]}
        />
      </div>

      {/* Brand */}
      <div>
        <span className={label}>Brand</span>
        <select
          className={input}
          value={get("make")}
          onChange={(e) => {
            onChange("make", e.target.value);
            onChange("model", "");
          }}
        >
          <option value="">All brands</option>
          {meta?.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div>
        <span className={label}>Model</span>
        <select className={input} value={get("model")} onChange={(e) => onChange("model", e.target.value)}>
          <option value="">All models</option>
          {models.map((m) => (
            <option key={`${m.make}-${m.model}`} value={m.model}>
              {m.model}
            </option>
          ))}
        </select>
      </div>

      {/* Year */}
      <div>
        <span className={label}>Year</span>
        <div className={row}>
          <input className={input} type="number" placeholder="From" value={get("yearMin")} onChange={(e) => onChange("yearMin", e.target.value)} />
          <input className={input} type="number" placeholder="To" value={get("yearMax")} onChange={(e) => onChange("yearMax", e.target.value)} />
        </div>
      </div>

      {/* Source */}
      <div>
        <span className={label}>Source</span>
        <select className={input} value={get("source")} onChange={(e) => onChange("source", e.target.value)}>
          <option value="">All sources</option>
          {meta?.sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Toggles */}
      <div className="space-y-3 border-t border-line pt-4">
        <Toggle label="Certified Pre-Owned only" checked={get("cpoOnly") === "true"} onChange={(v) => onChange("cpoOnly", v ? "true" : "")} />
        <Toggle label="Dealer listings only" checked={get("dealerOnly") === "true"} onChange={(v) => onChange("dealerOnly", v ? "true" : "")} />
      </div>
    </aside>
  );
}
