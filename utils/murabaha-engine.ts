/**
 * Murabaha Financing Engine
 *
 * Pure, stateless function that converts a merchant's GTV and risk score
 * into a Murabaha-compliant financing structure. No LLM calls, no side effects.
 *
 * Exported for use by FinancingStructureAgent and testable in isolation.
 *
 * Islamic finance constraints:
 *   - Zalyx buys the asset at COST PRICE
 *   - Zalyx sells the asset to the merchant at SALE PRICE (cost + disclosed profit)
 *   - No interest, no compounding, no hidden fees
 *   - Profit margin is fixed and agreed upfront
 */

export interface MurabahaStructure {
  salePriceNaira: number;       // Total amount merchant repays
  costPriceNaira: number;       // What Zalyx pays to acquire the asset
  profitNaira: number;          // Zalyx's disclosed profit (sale - cost)
  profitMarginPct: number;      // Profit as % of sale price (not APR)
  tenorMonths: number;          // Repayment period
  monthlyInstallmentNaira: number;
  affordabilityRatio: number;   // monthlyInstallment / avgMonthlyGTV (should be ≤ 0.20)
  riskTier: "low" | "moderate" | "high";
  affordabilityCapped: boolean; // True if sale price was reduced to fit affordability cap
}

export interface MurabahaEngineInput {
  avgMonthlyGTV: number;   // Average monthly GTV in naira
  riskScore: number;       // 0–100 overall risk score
}

/**
 * Risk tier thresholds and policy parameters.
 * These are Zalyx's internal financing policy — not interest rates.
 */
export const RISK_TIER_POLICY = {
  low:      { scoreMax: 35, gtvOfferPct: 0.25, tenorMonths: 6, profitMarginPct: 0.10 },
  moderate: { scoreMax: 65, gtvOfferPct: 0.15, tenorMonths: 3, profitMarginPct: 0.15 },
  high:     { scoreMax: 80, gtvOfferPct: 0.05, tenorMonths: 2, profitMarginPct: 0.20 },
} as const;

export const AFFORDABILITY_CAP = 0.20; // Monthly installment must be ≤ 20% of avg monthly GTV
export const MINIMUM_SALE_PRICE = 10_000; // Floor to avoid meaningless offers

export function computeMurabahaStructure(input: MurabahaEngineInput): MurabahaStructure {
  const { avgMonthlyGTV, riskScore } = input;

  // ── Step 1: Determine risk tier ──────────────────────────────────────────────
  let riskTier: "low" | "moderate" | "high";
  let gtvOfferPct: number;
  let tenorMonths: number;
  let profitMarginPct: number;

  if (riskScore < RISK_TIER_POLICY.low.scoreMax) {
    riskTier       = "low";
    gtvOfferPct    = RISK_TIER_POLICY.low.gtvOfferPct;
    tenorMonths    = RISK_TIER_POLICY.low.tenorMonths;
    profitMarginPct = RISK_TIER_POLICY.low.profitMarginPct;
  } else if (riskScore < RISK_TIER_POLICY.moderate.scoreMax) {
    riskTier       = "moderate";
    gtvOfferPct    = RISK_TIER_POLICY.moderate.gtvOfferPct;
    tenorMonths    = RISK_TIER_POLICY.moderate.tenorMonths;
    profitMarginPct = RISK_TIER_POLICY.moderate.profitMarginPct;
  } else {
    riskTier       = "high";
    gtvOfferPct    = RISK_TIER_POLICY.high.gtvOfferPct;
    tenorMonths    = RISK_TIER_POLICY.high.tenorMonths;
    profitMarginPct = RISK_TIER_POLICY.high.profitMarginPct;
  }

  // ── Step 2: Initial sale price from GTV ──────────────────────────────────────
  let salePriceNaira = Math.round(avgMonthlyGTV * gtvOfferPct);

  // ── Step 3: Affordability cap ────────────────────────────────────────────────
  // Monthly installment ≤ 20% of avg monthly GTV.
  // If the raw sale price would make repayments too heavy, reduce to fit.
  const maxMonthlyInstallment = Math.round(avgMonthlyGTV * AFFORDABILITY_CAP);
  const maxSalePrice = maxMonthlyInstallment * tenorMonths;
  const affordabilityCapped = salePriceNaira / tenorMonths > maxMonthlyInstallment;
  if (affordabilityCapped) {
    salePriceNaira = maxSalePrice;
  }

  // ── Step 4: Minimum floor ─────────────────────────────────────────────────────
  salePriceNaira = Math.max(salePriceNaira, MINIMUM_SALE_PRICE);

  // ── Step 5: Murabaha profit split ─────────────────────────────────────────────
  // Profit = sale price × profit margin %  (disclosed to merchant upfront)
  // Cost price = what Zalyx pays to acquire the asset on merchant's behalf
  const profitNaira    = Math.round(salePriceNaira * profitMarginPct);
  const costPriceNaira = salePriceNaira - profitNaira;

  // ── Step 6: Installment and affordability ratio ───────────────────────────────
  const monthlyInstallmentNaira = Math.round(salePriceNaira / tenorMonths);
  const affordabilityRatio = avgMonthlyGTV > 0
    ? monthlyInstallmentNaira / avgMonthlyGTV
    : 0;

  return {
    salePriceNaira,
    costPriceNaira,
    profitNaira,
    profitMarginPct: profitMarginPct * 100,
    tenorMonths,
    monthlyInstallmentNaira,
    affordabilityRatio,
    riskTier,
    affordabilityCapped,
  };
}
