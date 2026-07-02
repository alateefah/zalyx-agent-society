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
  salePriceNaira: number;       // Recommended/max sale price merchant repays
  costPriceNaira: number;       // Recommended/max amount Zalyx invests to acquire the asset
  profitNaira: number;          // Zalyx's disclosed profit at recommended/max amount
  minSalePriceNaira: number;    // Lowest sale price customer may select
  maxSalePriceNaira: number;    // Highest sale price approved by policy
  recommendedSalePriceNaira: number;
  minCostPriceNaira: number;    // Lowest asset cost Zalyx will finance
  maxCostPriceNaira: number;    // Maximum asset cost Zalyx will finance
  recommendedCostPriceNaira: number;
  minProfitNaira: number;
  maxProfitNaira: number;
  recommendedProfitNaira: number;
  profitMarginPct: number;      // Profit as % of sale price (not APR)
  tenorMonths: number;          // Repayment period
  monthlyInstallmentNaira: number;
  minMonthlyInstallmentNaira: number;
  maxMonthlyInstallmentNaira: number;
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
export const MIN_OFFER_PCT_OF_MAX = 0.5; // Customer may choose from 50% of cap up to the cap

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
  let maxSalePriceNaira = Math.round(avgMonthlyGTV * gtvOfferPct);

  // ── Step 3: Affordability cap ────────────────────────────────────────────────
  // Monthly installment ≤ 20% of avg monthly GTV.
  // If the raw sale price would make repayments too heavy, reduce to fit.
  const maxMonthlyInstallment = Math.round(avgMonthlyGTV * AFFORDABILITY_CAP);
  const maxSalePrice = maxMonthlyInstallment * tenorMonths;
  const affordabilityCapped = maxSalePriceNaira / tenorMonths > maxMonthlyInstallment;
  if (affordabilityCapped) {
    maxSalePriceNaira = maxSalePrice;
  }

  // ── Step 4: Minimum floor ─────────────────────────────────────────────────────
  maxSalePriceNaira = Math.max(maxSalePriceNaira, MINIMUM_SALE_PRICE);

  // ── Step 4b: Customer-selectable range ───────────────────────────────────────
  // The max is the risk-policy cap. The min is a stable lower ticket, so the
  // merchant can choose less without the model "guessing" a different amount.
  let minSalePriceNaira = Math.round(maxSalePriceNaira * MIN_OFFER_PCT_OF_MAX);
  minSalePriceNaira = Math.max(minSalePriceNaira, MINIMUM_SALE_PRICE);
  minSalePriceNaira = Math.min(minSalePriceNaira, maxSalePriceNaira);
  const recommendedSalePriceNaira = maxSalePriceNaira;

  // ── Step 5: Murabaha profit split ─────────────────────────────────────────────
  // Profit = sale price × profit margin %  (disclosed to merchant upfront)
  // Cost price = what Zalyx pays to acquire the asset on merchant's behalf
  const minProfitNaira = Math.round(minSalePriceNaira * profitMarginPct);
  const maxProfitNaira = Math.round(maxSalePriceNaira * profitMarginPct);
  const recommendedProfitNaira = Math.round(recommendedSalePriceNaira * profitMarginPct);
  const minCostPriceNaira = minSalePriceNaira - minProfitNaira;
  const maxCostPriceNaira = maxSalePriceNaira - maxProfitNaira;
  const recommendedCostPriceNaira = recommendedSalePriceNaira - recommendedProfitNaira;

  // ── Step 6: Installment and affordability ratio ───────────────────────────────
  const minMonthlyInstallmentNaira = Math.round(minSalePriceNaira / tenorMonths);
  const maxMonthlyInstallmentNaira = Math.round(maxSalePriceNaira / tenorMonths);
  const monthlyInstallmentNaira = maxMonthlyInstallmentNaira;
  const affordabilityRatio = avgMonthlyGTV > 0
    ? monthlyInstallmentNaira / avgMonthlyGTV
    : 0;

  return {
    salePriceNaira: recommendedSalePriceNaira,
    costPriceNaira: recommendedCostPriceNaira,
    profitNaira: recommendedProfitNaira,
    minSalePriceNaira,
    maxSalePriceNaira,
    recommendedSalePriceNaira,
    minCostPriceNaira,
    maxCostPriceNaira,
    recommendedCostPriceNaira,
    minProfitNaira,
    maxProfitNaira,
    recommendedProfitNaira,
    profitMarginPct: profitMarginPct * 100,
    tenorMonths,
    monthlyInstallmentNaira,
    minMonthlyInstallmentNaira,
    maxMonthlyInstallmentNaira,
    affordabilityRatio,
    riskTier,
    affordabilityCapped,
  };
}
