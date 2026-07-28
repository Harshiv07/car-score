/**
 * Financing maths for the payment estimator.
 *
 * First-time buyers shop by monthly payment, not sticker price — a $28k car at
 * 8.9% over 72 months and a $24k car at 6.9% over 60 land in very different
 * places than the price tags suggest. These are estimates, and the UI says so:
 * real approval depends on credit, and provincial tax and dealer fees vary.
 */

export interface LoanInput {
  price: number;
  downPayment: number;
  /** Annual nominal rate as a percent, e.g. 7.9 */
  ratePercent: number;
  termMonths: number;
  /** Combined sales tax rate as a percent, e.g. 13 for Ontario HST. */
  taxPercent: number;
}

export interface LoanResult {
  monthly: number;
  amountFinanced: number;
  totalInterest: number;
  totalCost: number;
}

/** Combined provincial + federal sales tax on a used vehicle purchase. */
export const TAX_BY_PROVINCE: Record<string, number> = {
  ON: 13,
  BC: 12,
  AB: 5,
  SK: 11,
  MB: 12,
  QC: 14.975,
  NB: 15,
  NS: 15,
  PE: 15,
  NL: 15,
  YT: 5,
  NT: 5,
  NU: 5,
};

export const DEFAULT_TAX = 13;

export function taxFor(province: string | null | undefined): number {
  if (!province) return DEFAULT_TAX;
  return TAX_BY_PROVINCE[province.toUpperCase()] ?? DEFAULT_TAX;
}

export function computeLoan({ price, downPayment, ratePercent, termMonths, taxPercent }: LoanInput): LoanResult {
  const withTax = price * (1 + taxPercent / 100);
  const amountFinanced = Math.max(0, withTax - downPayment);

  const r = ratePercent / 100 / 12;
  // Zero-interest is a valid input and would divide by zero in the annuity formula.
  const monthly =
    r === 0
      ? amountFinanced / termMonths
      : (amountFinanced * r) / (1 - Math.pow(1 + r, -termMonths));

  const totalPaid = monthly * termMonths;
  return {
    monthly,
    amountFinanced,
    totalInterest: Math.max(0, totalPaid - amountFinanced),
    totalCost: totalPaid + downPayment,
  };
}

/** Defaults tuned to a first-time buyer with limited credit history. */
export const DEFAULT_LOAN = {
  downPaymentPercent: 10,
  ratePercent: 8.9,
  termMonths: 72,
};

/**
 * The at-a-glance monthly figure shown on listing cards — same maths, fixed
 * assumptions, so cards stay comparable to each other.
 */
export function quickMonthly(price: number, province?: string | null): number {
  return computeLoan({
    price,
    downPayment: price * (DEFAULT_LOAN.downPaymentPercent / 100),
    ratePercent: DEFAULT_LOAN.ratePercent,
    termMonths: DEFAULT_LOAN.termMonths,
    taxPercent: taxFor(province),
  }).monthly;
}
