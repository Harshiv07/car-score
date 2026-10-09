import { memo, useCallback } from "react";
import { MetaResponse } from "../api/types";
import { useDebouncedCommit } from "../hooks/useDebouncedCommit";
import { Segmented, Select, Toggle, cad, km, Option } from "./ui";

const PRICE_MIN = 5000;
const PRICE_MAX = 60000;
const MILEAGE_MAX = 200000;
const YEAR_FLOOR = 2016;

/**
 * All filters write straight into URL search params (shareable, survives
 * reload). `onChange(key, value)` sets or clears one param.
 */
function FiltersSidebarImpl({
  meta,
  params,
  onChange,
  onClear,
  inDrawer = false,
}: {
  meta: MetaResponse | undefined;
  params: URLSearchParams;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  /** The drawer has its own title; don't repeat it. */
  inDrawer?: boolean;
}) {
  const get = (k: string) => params.get(k) ?? "";
  const models = meta?.models.filter((m) => !get("make") || m.make === get("make")) ?? [];
  const activeCount = [...params.keys()].filter((k) => !["sort", "page", "pageSize", "view"].includes(k)).length;

  const label = "label mb-2";

  // The sliders move instantly; only the committed value is debounced, so a
  // drag across the range is one request instead of one per pixel.
  const commitPrice = useCallback(
    (v: number) => onChange("priceMax", v >= PRICE_MAX ? "" : String(v)),
    [onChange]
  );
  const commitMileage = useCallback(
    (v: number) => onChange("mileageMax", v >= MILEAGE_MAX ? "" : String(v)),
    [onChange]
  );
  const [priceMax, setPriceMax] = useDebouncedCommit(Number(get("priceMax")) || PRICE_MAX, commitPrice);
  const [mileageMax, setMileageMax] = useDebouncedCommit(Number(get("mileageMax")) || MILEAGE_MAX, commitMileage);

  const currentYear = new Date().getFullYear();
  const years: Option[] = [{ value: "", label: "Any" }];
  for (let y = currentYear; y >= YEAR_FLOOR; y--) years.push({ value: String(y), label: String(y) });

  // Keep the range coherent: "to" can't offer years before "from" and vice versa.
  const yearMin = Number(get("yearMin")) || 0;
  const yearMax = Number(get("yearMax")) || 0;
  const yearFromOptions = years.filter((o) => !o.value || !yearMax || Number(o.value) <= yearMax);
  const yearToOptions = years.filter((o) => !o.value || !yearMin || Number(o.value) >= yearMin);

  const brandOptions: Option[] = [{ value: "", label: "All brands" }, ...(meta?.brands ?? []).map((b) => ({ value: b, label: b }))];
  const modelOptions: Option[] = [{ value: "", label: "All models" }, ...models.map((m) => ({ value: m.model, label: m.model }))];
  const sourceOptions: Option[] = [{ value: "", label: "All sources" }, ...(meta?.sources ?? []).map((s) => ({ value: s, label: s }))];

  return (
    <aside className="space-y-6">
      <div className="flex min-h-7 items-center justify-between">
        {inDrawer ? <span /> : <h2 className="wide text-[17px] font-bold text-text">Narrow it down</h2>}
        {activeCount > 0 && (
          <button onClick={onClear} className="link text-[13px]">
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {/* Max price slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Max price</span>
          <span className="nums text-[13px] font-semibold text-text">{priceMax >= PRICE_MAX ? "Any" : cad(priceMax)}</span>
        </div>
        <input
          type="range"
          className="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={1000}
          value={priceMax}
          style={{ ["--pct" as string]: `${((priceMax - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%` }}
          onChange={(e) => setPriceMax(Number(e.target.value))}
          aria-label="Maximum price"
        />
      </div>

      {/* Max mileage slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className={label}>Max mileage</span>
          <span className="nums text-[13px] font-semibold text-text">{mileageMax >= MILEAGE_MAX ? "Any" : km(mileageMax)}</span>
        </div>
        <input
          type="range"
          className="range"
          min={20000}
          max={MILEAGE_MAX}
          step={5000}
          value={mileageMax}
          style={{ ["--pct" as string]: `${((mileageMax - 20000) / (MILEAGE_MAX - 20000)) * 100}%` }}
          onChange={(e) => setMileageMax(Number(e.target.value))}
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
          <Select ariaLabel="Year from" value={get("yearMin")} options={yearFromOptions} onChange={(v) => onChange("yearMin", v)} />
          <Select ariaLabel="Year to" value={get("yearMax")} options={yearToOptions} onChange={(v) => onChange("yearMax", v)} />
        </div>
      </div>

      {/* Source */}
      <div>
        <span className={label}>Source</span>
        <Select ariaLabel="Source" value={get("source")} options={sourceOptions} onChange={(v) => onChange("source", v)} />
      </div>

      {/* Toggles */}
      <div className="space-y-3.5 border-t border-line pt-5">
        <Toggle label="Certified pre-owned only" checked={get("cpoOnly") === "true"} onChange={(v) => onChange("cpoOnly", v ? "true" : "")} />
        <Toggle label="Dealer listings only" checked={get("dealerOnly") === "true"} onChange={(v) => onChange("dealerOnly", v ? "true" : "")} />
      </div>
    </aside>
  );
}

/**
 * Memoised: the sidebar depends on the filter params and the meta options, and
 * on nothing about the listings themselves. Without this it re-rendered on every
 * result change — every page turn, every refetch — rebuilding all six option
 * lists to draw exactly what was already on screen.
 */
export const FiltersSidebar = memo(FiltersSidebarImpl);
