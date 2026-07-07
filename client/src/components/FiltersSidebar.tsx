import { MetaResponse } from "../api/types";
import { Segmented, Select, Toggle, cad, km, Option } from "./ui";

const PRICE_MIN = 5000;
const PRICE_MAX = 60000;
const MILEAGE_MAX = 200000;
const YEAR_FLOOR = 2016;

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

  const priceMax = Number(get("priceMax")) || PRICE_MAX;
  const mileageMax = Number(get("mileageMax")) || MILEAGE_MAX;

  const currentYear = new Date().getFullYear();
  const years: Option[] = [{ value: "", label: "Any" }];
  for (let y = currentYear; y >= YEAR_FLOOR; y--) years.push({ value: String(y), label: String(y) });

  const brandOptions: Option[] = [{ value: "", label: "All brands" }, ...(meta?.brands ?? []).map((b) => ({ value: b, label: b }))];
  const modelOptions: Option[] = [{ value: "", label: "All models" }, ...models.map((m) => ({ value: m.model, label: m.model }))];
  const sourceOptions: Option[] = [{ value: "", label: "All sources" }, ...(meta?.sources ?? []).map((s) => ({ value: s, label: s }))];

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
          <span className="nums text-xs font-semibold text-text">{priceMax >= PRICE_MAX ? "Any" : cad(priceMax)}</span>
        </div>
        <input
          type="range"
          className="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={1000}
          value={priceMax}
          style={{ ["--pct" as string]: `${((priceMax - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%` }}
          onChange={(e) => onChange("priceMax", Number(e.target.value) >= PRICE_MAX ? "" : e.target.value)}
          aria-label="Maximum price"
        />
      </div>

      {/* Max mileage slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Max mileage</span>
          <span className="nums text-xs font-semibold text-text">{mileageMax >= MILEAGE_MAX ? "Any" : km(mileageMax)}</span>
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
        <Select ariaLabel="Brand" value={get("make")} options={brandOptions} onChange={(v) => onChange("make", v)} />
      </div>

      {/* Model */}
      <div>
        <span className={label}>Model</span>
        <Select ariaLabel="Model" value={get("model")} options={modelOptions} onChange={(v) => onChange("model", v)} />
      </div>

      {/* Year range (from 2016) */}
      <div>
        <span className={label}>Year</span>
        <div className="grid grid-cols-2 gap-2">
          <Select ariaLabel="Year from" value={get("yearMin")} options={years} onChange={(v) => onChange("yearMin", v)} />
          <Select ariaLabel="Year to" value={get("yearMax")} options={years} onChange={(v) => onChange("yearMax", v)} />
        </div>
      </div>

      {/* Source */}
      <div>
        <span className={label}>Source</span>
        <Select ariaLabel="Source" value={get("source")} options={sourceOptions} onChange={(v) => onChange("source", v)} />
      </div>

      {/* Toggles */}
      <div className="space-y-3 border-t border-line pt-4">
        <Toggle label="Certified Pre-Owned only" checked={get("cpoOnly") === "true"} onChange={(v) => onChange("cpoOnly", v ? "true" : "")} />
        <Toggle label="Dealer listings only" checked={get("dealerOnly") === "true"} onChange={(v) => onChange("dealerOnly", v ? "true" : "")} />
      </div>
    </aside>
  );
}
