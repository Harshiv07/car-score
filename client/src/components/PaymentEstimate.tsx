import { useState } from "react";
import { computeLoan, taxFor, DEFAULT_LOAN } from "../lib/finance";
import { cad } from "./ui";

/**
 * What this car costs per month.
 *
 * A first-time buyer's real constraint is the monthly payment, and the gap
 * between a sticker price and a payment — tax, rate, term — is exactly where
 * dealer finance offices make their margin. Showing the arithmetic up front,
 * with the total interest called out, is the point.
 */
export function PaymentEstimate({ price, province }: { price: number; province: string | null }) {
  const [downPercent, setDownPercent] = useState(DEFAULT_LOAN.downPaymentPercent);
  const [ratePercent, setRatePercent] = useState(DEFAULT_LOAN.ratePercent);
  const [termMonths, setTermMonths] = useState(DEFAULT_LOAN.termMonths);

  const taxPercent = taxFor(province);
  const downPayment = Math.round((price * downPercent) / 100);
  const loan = computeLoan({ price, downPayment, ratePercent, termMonths, taxPercent });

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">Estimated payment</span>
        <span className="nums font-display text-3xl font-extrabold text-brand">
          {cad(loan.monthly)}
          <span className="text-base font-bold text-faint">/mo</span>
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <Slider
          label="Down payment"
          value={`${downPercent}% · ${cad(downPayment)}`}
          min={0}
          max={50}
          step={5}
          current={downPercent}
          onChange={setDownPercent}
          ariaLabel="Down payment percentage"
        />
        <Slider
          label="Interest rate"
          value={`${ratePercent.toFixed(1)}%`}
          min={0}
          max={16}
          step={0.5}
          current={ratePercent}
          onChange={setRatePercent}
          ariaLabel="Annual interest rate"
        />
        <div>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-faint">Term</span>
          <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-surface2 p-1">
            {[36, 48, 60, 72, 84].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={termMonths === m}
                onClick={() => setTermMonths(m)}
                className={`rounded-md px-1 py-1.5 text-xs font-semibold transition ${
                  termMonths === m ? "bg-brand shadow-sm" : "text-muted hover:text-text"
                }`}
                style={termMonths === m ? { color: "var(--on-brand)" } : undefined}
              >
                {m}mo
              </button>
            ))}
          </div>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
        <Line label={`Price + tax (${taxPercent}%)`} value={cad(price * (1 + taxPercent / 100))} />
        <Line label="Amount financed" value={cad(loan.amountFinanced)} />
        <Line label="Total interest" value={cad(loan.totalInterest)} tone="bad" />
      </dl>

      <p className="mt-3 text-xs text-faint">
        An estimate. Your rate depends on credit history and lender; tax assumes {province ?? "Ontario"} and excludes
        licensing and dealer fees.
      </p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</span>
        <span className="nums text-xs font-semibold text-text">{value}</span>
      </div>
      <input
        type="range"
        className="range mt-1.5"
        min={min}
        max={max}
        step={step}
        value={current}
        aria-label={ariaLabel}
        style={{ ["--pct" as string]: `${((current - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`nums font-semibold ${tone === "bad" ? "text-bad" : "text-text"}`}>{value}</dd>
    </div>
  );
}
