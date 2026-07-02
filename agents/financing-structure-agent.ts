import {
  ZalyxMerchantSnapshot,
  FinancingStructureResult,
  AgentDebateMessage,
  BusinessAnalysisResult,
  RiskAssessmentResult,
} from "../utils/types";
import { qwenClient, STRUCTURE_MURABAHA_OFFER_TOOL } from "../utils/qwen-client";
import { computeMurabahaStructure } from "../utils/murabaha-engine";
import { computeOfferPolicyInputs } from "../utils/policy-metrics";

const fmt = (n: number) =>
  `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export class FinancingStructureAgent {
  agentName = "Financing Structure Agent";
  agentRole = "Designs Sharia-compliant financing terms that balance merchant needs with lender protection";

  async evaluate(
    snapshot: ZalyxMerchantSnapshot,
    businessAnalysis: BusinessAnalysisResult,
    riskAssessment: RiskAssessmentResult
  ): Promise<{
    result: FinancingStructureResult;
    debateMessage: AgentDebateMessage;
  }> {
    const policyInputs = computeOfferPolicyInputs(snapshot);
    const structure = computeMurabahaStructure({
      avgMonthlyGTV: policyInputs.avgMonthlyGTV,
      riskScore: policyInputs.riskScore,
    });

    const offerRange = {
      minCostPriceNaira: structure.minCostPriceNaira,
      maxCostPriceNaira: structure.maxCostPriceNaira,
      recommendedCostPriceNaira: structure.recommendedCostPriceNaira,
      minSalePriceNaira: structure.minSalePriceNaira,
      maxSalePriceNaira: structure.maxSalePriceNaira,
      recommendedSalePriceNaira: structure.recommendedSalePriceNaira,
      profitMarginPct: structure.profitMarginPct,
      tenorMonths: structure.tenorMonths,
      customerSelectable: true,
      reviewCadence: policyInputs.reviewCadence,
      reviewPeriod: policyInputs.reviewPeriod,
      validFrom: policyInputs.validFrom,
      validUntil: policyInputs.validUntil,
      policyVersion: policyInputs.policyVersion,
    };
    const costRangeLabel = `${fmt(structure.minCostPriceNaira)}–${fmt(structure.maxCostPriceNaira)}`;
    const saleRangeLabel = `${fmt(structure.minSalePriceNaira)}–${fmt(structure.maxSalePriceNaira)}`;
    const installmentRangeLabel = `${fmt(structure.minMonthlyInstallmentNaira)}–${fmt(structure.maxMonthlyInstallmentNaira)}`;

    const prompt = `
You are a fintech structuring specialist designing a Murabaha-compliant financing offer for a Nigerian merchant.

Murabaha = Zalyx purchases the asset(s) the merchant needs at COST PRICE, then sells those assets
to the merchant at a fixed SALE PRICE (cost + profit). The merchant repays the sale price in equal
installments. Ownership transfers immediately on sale. No interest, no compounding, no late fees.

MERCHANT: ${snapshot.businessName} (${snapshot.businessType})
Avg monthly GTV: ${fmt(policyInputs.avgMonthlyGTV)}
Review cadence: monthly
Review period: ${policyInputs.reviewPeriod} data, valid ${policyInputs.validFrom} to ${policyInputs.validUntil}
Policy risk score: ${policyInputs.riskScore}/100
Platform age: ${snapshot.ageInDays} days

AGENT DEBATE SO FAR:
- Business Analyst: Health score ${businessAnalysis.businessHealthScore}/100 — "${businessAnalysis.recommendation}"
- Risk Officer: Risk score ${riskAssessment.overallRiskScore}/100 — "${riskAssessment.recommendation}"
- Risk factors: ${riskAssessment.riskFactors.length > 0 ? riskAssessment.riskFactors.join("; ") : "None"}

POLICY ENGINE — COMPUTED MURABAHA STRUCTURE:
- Risk tier: ${structure.riskTier.toUpperCase()}
- Maximum sale price cap: ${fmt(structure.maxSalePriceNaira)} (${structure.riskTier === "low" ? "25%" : structure.riskTier === "moderate" ? "15%" : "5%"} of avg monthly GTV)
- Customer-selectable sale price range: ${saleRangeLabel}
- Customer-selectable cost price / investment range: ${costRangeLabel}
- Recommended/default cost price: ${fmt(structure.recommendedCostPriceNaira)}
- Profit margin: ${structure.profitMarginPct.toFixed(0)}% of selected sale price
- Tenor: ${structure.tenorMonths} months
- Monthly installment range: ${installmentRangeLabel}/month
- Installment as % of monthly GTV: ${(structure.affordabilityRatio * 100).toFixed(1)}% (must be ≤ 20%)

DISBURSEMENT CONDITIONS: ${this.buildMitigations(snapshot, riskAssessment).join("; ")}

As the structuring agent:
1. Do not choose a single amount. Explain the approved range and that the merchant may choose any amount inside it.
2. Explain that this range is fixed for the monthly review period and rerunning inside the same period does not improve the offer.
3. Justify the tenor — why ${structure.tenorMonths} months fits this merchant's repayment cycle.
4. Confirm the affordability ratio is acceptable and explain what it means.
5. Address any risk flags and how the structure accounts for them.
6. Remind that this is Murabaha: fixed profit, no compounding, ownership transfers on purchase.

Be specific. Reference the actual naira figures.
`;

    // Function calling — Qwen invokes structure_murabaha_offer with precise terms
    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Context:\n${JSON.stringify(snapshot, null, 2)}\n\nAnalysis request:\n${prompt}` }],
      [STRUCTURE_MURABAHA_OFFER_TOOL],
      this.agentName
    );

    // Qwen may explain terms and conditions, but policy owns the money values.
    const tc = response.toolCall?.name === "structure_murabaha_offer"
      ? (response.toolCall.arguments as any)
      : null;

    const schedule = `${installmentRangeLabel}/month over ${structure.tenorMonths} months (sale price range: ${saleRangeLabel})`;
    const disbursementConditions: string[] = tc?.disbursement_conditions ?? this.buildMitigations(snapshot, riskAssessment);

    const result: FinancingStructureResult = {
      proposedAmount: costRangeLabel,
      offerRange,
      repaymentTerms: `Murabaha · Customer selects cost price ${costRangeLabel} → sale price ${saleRangeLabel} · Profit margin ${structure.profitMarginPct.toFixed(0)}%`,
      paymentSchedule: schedule,
      riskMitigation: disbursementConditions.length > 0 ? disbursementConditions : this.buildMitigations(snapshot, riskAssessment),
      rationale:
        `Policy range: Zalyx can invest ${costRangeLabel}. The merchant may choose a smaller ticket inside the range; the maximum cap is anchored to ${fmt(policyInputs.avgMonthlyGTV)} avg monthly GTV, ${structure.riskTier} risk tier, and the 20% installment affordability threshold. This is the ${policyInputs.reviewPeriod} monthly review offer, valid through ${policyInputs.validUntil}; reruns inside the same review period reuse the same policy range unless merchant data or policy version changes.`,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: `Murabaha policy range: Zalyx can buy assets costing ${costRangeLabel}; the merchant chooses the actual ticket. Zalyx then sells at a fixed sale price range of ${saleRangeLabel}, repaid ${installmentRangeLabel}/month over ${structure.tenorMonths} months. This ${policyInputs.reviewPeriod} monthly offer is valid through ${policyInputs.validUntil}; no model-chosen principal or retry-improved amount is used.`,
      recommendation: `${costRangeLabel} selectable cost price · ${structure.tenorMonths} months`,
      confidence: Math.round((businessAnalysis.businessHealthScore + (100 - riskAssessment.overallRiskScore)) / 2),
    };

    return { result, debateMessage };
  }

  private buildMitigations(
    snapshot: ZalyxMerchantSnapshot,
    riskAssessment: RiskAssessmentResult
  ): string[] {
    const m: string[] = [];
    if (riskAssessment.overallRiskScore > 60) m.push("Reduced approved cap to limit exposure");
    if (snapshot.signals.period30d.activeDays < 5) m.push("Conditional on 15+ active days within 30 days of disbursement");
    if (snapshot.receivables.uncollectedNaira > 300000) m.push("Merchant to demonstrate receivables collection before disbursal");
    if (snapshot.ageInDays < 90) m.push("Short tenor (2–3 months) due to limited platform history");
    if (riskAssessment.concentrationRisk === "high") m.push("Merchant encouraged to diversify customer base");
    if (m.length === 0) m.push("Standard Murabaha terms — no additional conditions required");
    return m;
  }
}
