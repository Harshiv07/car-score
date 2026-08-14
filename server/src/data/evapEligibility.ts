/**
 * Eligibility check for Canada's federal Electric Vehicle Affordability
 * Program (EVAP) — April 1, 2026 through March 31, 2031, replacing the old
 * iZEV incentive. Up to $5,000 back on an eligible battery-electric (BEV) or
 * fuel-cell-electric (FCEV) vehicle, up to $2,500 on an eligible plug-in
 * hybrid, gated on the vehicle's pre-tax price being $50,000 or less.
 *
 * Scope: this only evaluates the $5,000 BEV/FCEV tier, i.e. listings with
 * `fuelType === "Electric"`. `FuelType` in `types.ts` is
 * `"Gas" | "Hybrid" | "Diesel" | "Electric" | "Unknown"` — there is no
 * plug-in-hybrid value, so a scraped "Hybrid" listing could be a regular
 * hybrid or a PHEV and there is no way to tell from the data we collect.
 * Guessing would be fabricating a distinction the schema can't support, so
 * the $2,500 PHEV tier is intentionally left unimplemented here rather than
 * approximated. If the scrapers ever start capturing plug-in status, this is
 * the place to add it.
 *
 * The price gate reads `listing.price` as-is. AutoTrader/dealer-site prices
 * as scraped are the pre-tax advertised figure (tax is layered on separately
 * for the payment estimator — see `client/src/lib/finance.ts`), which matches
 * how the program states its $50,000 cap.
 *
 * The country-of-origin gate — required for the $5,000 tier specifically,
 * not just any BEV/FCEV — is the part this file can least claim to get
 * right. The government's own eligible-vehicle list is the source of truth,
 * and as of this research it has no public API to query. What follows is a
 * make-level allow/deny list, which is a simplification and *not* a legal
 * determination: eligibility actually depends on the specific plant a given
 * VIN was built in, and some brands split production across both a
 * free-trade country and China depending on model or trim (Tesla's Model
 * 3/Y sold in Canada come from both its Fremont, USA plant and its
 * Shanghai, China plant; Polestar is built in China). Rather than guess
 * per-listing for those brands, they're left off the allow-list entirely so
 * they read as "unverified" instead of a false yes. Treat this as
 * "may qualify" guidance for a first-time buyer, not a guarantee — always
 * confirm against the government's published list before counting on the
 * rebate.
 */

import { EvapEligibility } from "../types";

const REBATE_BEV_FCEV = 5000;
const PRICE_CAP_CAD = 50000;

/**
 * Mainstream automakers whose Canadian-market vehicles are, as a general
 * rule, assembled in a country with a Canada free trade agreement — CUSMA
 * (USA/Mexico/Canada), CETA (EU), the Canada–Korea FTA, or the Canada–Japan
 * economic partnership. Matched case-insensitively against `Listing.make`.
 *
 * Deliberately excludes brands with meaningful China-built volume sold in
 * Canada even though they're otherwise "mainstream" — see Tesla/Polestar
 * note above.
 */
const FREE_TRADE_MAKES = new Set([
  "toyota",
  "honda",
  "hyundai",
  "kia",
  "genesis",
  "ford",
  "chevrolet",
  "gmc",
  "buick",
  "cadillac",
  "chrysler",
  "dodge",
  "jeep",
  "ram",
  "volkswagen",
  "audi",
  "porsche",
  "nissan",
  "infiniti",
  "subaru",
  "mazda",
  "mitsubishi",
  "volvo",
  "bmw",
  "mini",
  "mercedes-benz",
  "acura",
  "lexus",
]);

/** Known Chinese EV brands — excluded outright if they ever show up in inventory. */
const EXCLUDED_MAKES = new Set(["byd", "nio", "xpeng", "zeekr", "geely", "wuling", "hongqi", "gac", "changan", "mg"]);

/**
 * @param listing Only the fields this check needs, so tests and callers don't
 *   have to construct a full `Listing`.
 * @returns `null` when EVAP doesn't apply at all (not `fuelType: "Electric"`).
 *   Otherwise an eligibility verdict with a human-readable reason, meant to
 *   be shown to the buyer as-is.
 */
export function evapEligibility(listing: { fuelType: string; price: number; make: string }): EvapEligibility | null {
  if (listing.fuelType !== "Electric") return null;

  if (listing.price > PRICE_CAP_CAD) {
    return {
      eligible: false,
      rebateAmount: 0,
      reason: `Priced over EVAP's $${PRICE_CAP_CAD.toLocaleString("en-CA")} pre-tax cap.`,
    };
  }

  const make = listing.make.trim().toLowerCase();

  if (EXCLUDED_MAKES.has(make)) {
    return {
      eligible: false,
      rebateAmount: 0,
      reason: "Built by a manufacturer without a Canada free trade agreement, so it doesn't qualify for the $5,000 rebate.",
    };
  }

  if (!FREE_TRADE_MAKES.has(make)) {
    return {
      eligible: false,
      rebateAmount: 0,
      reason: "Country of assembly isn't confirmed — check the government's eligible-vehicle list before counting on this rebate.",
    };
  }

  return {
    eligible: true,
    rebateAmount: REBATE_BEV_FCEV,
    reason: `May qualify for up to $${REBATE_BEV_FCEV.toLocaleString("en-CA")} back under EVAP — confirm against the government's eligible-vehicle list before you buy.`,
  };
}
