import { MetaResponse } from "../api/types";

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
  const activeCount = [...params.keys()].filter((k) => !["sort", "page"].includes(k)).length;

  const label = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1";
  const input =
    "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
  const row = "grid grid-cols-2 gap-2";

  return (
    <aside className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">Filters</h2>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            Clear all ({activeCount})
          </button>
        )}
      </div>

      <div>
        <span className={label}>Price (CAD)</span>
        <div className={row}>
          <input className={input} type="number" placeholder="Min" value={get("priceMin")} onChange={(e) => onChange("priceMin", e.target.value)} />
          <input className={input} type="number" placeholder="Max" value={get("priceMax")} onChange={(e) => onChange("priceMax", e.target.value)} />
        </div>
      </div>

      <div>
        <span className={label}>Year</span>
        <div className={row}>
          <input className={input} type="number" placeholder="From" value={get("yearMin")} onChange={(e) => onChange("yearMin", e.target.value)} />
          <input className={input} type="number" placeholder="To" value={get("yearMax")} onChange={(e) => onChange("yearMax", e.target.value)} />
        </div>
      </div>

      <div>
        <span className={label}>Max mileage (km)</span>
        <input className={input} type="number" placeholder="e.g. 100000" value={get("mileageMax")} onChange={(e) => onChange("mileageMax", e.target.value)} />
      </div>

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
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div>
        <span className={label}>Model</span>
        <select className={input} value={get("model")} onChange={(e) => onChange("model", e.target.value)}>
          <option value="">All models</option>
          {models.map((m) => (
            <option key={`${m.make}-${m.model}`} value={m.model}>{m.model} ({m.body})</option>
          ))}
        </select>
      </div>

      <div className={row}>
        <div>
          <span className={label}>Province</span>
          <select className={input} value={get("province")} onChange={(e) => onChange("province", e.target.value)}>
            <option value="">All</option>
            {meta?.provinces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>City</span>
          <select className={input} value={get("city")} onChange={(e) => onChange("city", e.target.value)}>
            <option value="">All</option>
            {meta?.cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={row}>
        <div>
          <span className={label}>Drivetrain</span>
          <select className={input} value={get("drivetrain")} onChange={(e) => onChange("drivetrain", e.target.value)}>
            <option value="">All</option>
            {meta?.drivetrains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Fuel</span>
          <select className={input} value={get("fuelType")} onChange={(e) => onChange("fuelType", e.target.value)}>
            <option value="">All</option>
            {meta?.fuelTypes.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className={label}>Source website</span>
        <select className={input} value={get("source")} onChange={(e) => onChange("source", e.target.value)}>
          <option value="">All sources</option>
          {meta?.sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <span className={label}>Score range</span>
        <div className={row}>
          <input className={input} type="number" min={0} max={100} placeholder="Min" value={get("scoreMin")} onChange={(e) => onChange("scoreMin", e.target.value)} />
          <input className={input} type="number" min={0} max={100} placeholder="Max" value={get("scoreMax")} onChange={(e) => onChange("scoreMax", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cyan-600"
            checked={get("cpoOnly") === "true"}
            onChange={(e) => onChange("cpoOnly", e.target.checked ? "true" : "")}
          />
          Certified Pre-Owned only
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cyan-600"
            checked={get("dealerOnly") === "true"}
            onChange={(e) => onChange("dealerOnly", e.target.checked ? "true" : "")}
          />
          Dealer listings only
        </label>
      </div>
    </aside>
  );
}
