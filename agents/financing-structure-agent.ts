import {
  ZalyxMerchantSnapshot,
  FinancingStructureResult,
  AgentDebateMessage,
  BusinessAnalysisResult,
  RiskAssessmentResult,
} from "../utils/types";
import { qwenClient, STRUCTURE_MURABAHA_OFFER_TOOL } from "../utils/qwen-client";
import { computeMurabahaStructure } from "../utils/murabaha-engine";

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
    const structure = computeMurabahaStructure({
      avgMonthlyGTV: businessAnalysis.monthlyRevenueAverage,
      riskScore: riskAssessment.overallRiskScore,
    });

    const prompt = `
You are a fintech structuring specialist designing a Murabaha-compliant financing offer for a Nigerian merchant.

Murabaha = Zalyx purchases the asset(s) the merchant needs at COST PRICE, then sells those assets
to the merchant at a fixed SALE PRICE (cost + profit). The merchant repays the sale price in equal
installments. Ownership transfers immediately on sale. No interest, no compounding, no late fees.

MERCHANT: ${snapshot.businessName} (${snapshot.businessType})
Avg monthly GTV: ${fmt(businessAnalysis.monthlyRevenueAverage)}
Platform age: ${snapshot.ageInDays} days

AGENT DEBATE SO FAR:
- Business Analyst: Health score ${businessAnalysis.businessHealthScore}/100 — "${businessAnalysis.recommendation}"
- Risk Officer: Risk score ${riskAssessment.overallRiskScore}/100 — "${riskAssessment.recommendation}"
- Risk factors: ${riskAssessment.riskFactors.length > 0 ? riskAssessment.riskFactors.join("; ") : "None"}

POLICY ENGINE — COMPUTED MURABAHA STRUCTURE:
- Risk tier: ${riskAssessment.overallRiskScore < 35 ? "LOW" : riskAssessment.overallRiskScore < 65 ? "MODERATE" : "HIGH"}
- GTV offer %: ${riskAssessment.overallRiskScore < 35 ? "25%" : riskAssessment.overallRiskScore < 65 ? "15%" : "5%"} of avg monthly GTV
- Sale price (merchant repays): ${fmt(structure.salePriceNaira)}
- Profit margin: ${structure.profitMarginPct.toFixed(0)}% of sale price = ${fmt(structure.profitNaira)}
- Cost price (Zalyx buys asset at): ${fmt(structure.costPriceNaira)}
- Tenor: ${structure.tenorMonths} months
- Monthly installment: ${fmt(structure.monthlyInstallmentNaira)}
- Installment as % of monthly GTV: ${(structure.affordabilityRatio * 100).toFixed(1)}% (must be ≤ 20%)

DISBURSEMENT CONDITIONS: ${this.buildMitigations(snapshot, riskAssessment).join("; ")}

As the structuring agent:
1. Confirm the sale price, cost price, and profit margin — state them plainly for the merchant.
2. Justify the tenor — why ${structure.tenorMonths} months fits this merchant's repayment cycle.
3. Confirm the affordability ratio is acceptable and explain what it means.
4. Address any risk flags and how the structure accounts for them.
5. Remind that this is Murabaha: fixed profit, no compounding, ownership transfers on purchase.

Be specific. Reference the actual naira figures.
`;

    // Function calling — Qwen invokes structure_murabaha_offer with precise terms
    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Context:\n${JSON.stringify(snapshot, null, 2)}\n\nAnalysis request:\n${prompt}` }],
      [STRUCTURE_MURABAHA_OFFER_TOOL],
      this.agentName
    );

    // Prefer Qwen's structured output; fall back to policy engine values
    const tc = response.toolCall?.name === "structure_murabaha_offer"
      ? (response.toolCall.arguments as any)
      : null;

    // If Qwen returned tool values, recompute Murabaha split from its principal
    const salePriceNaira: number = tc?.principal_naira
      ? Math.round(tc.principal_naira * (1 + (tc.fixed_fee_pct ?? structure.profitMarginPct) / 100))
      : structure.salePriceNaira;
    const profitMarginPct: number = tc?.fixed_fee_pct ?? structure.profitMarginPct;
    const profitNaira: number = tc?.fixed_fee_naira ?? structure.profitNaira;
    const costPriceNaira: number = salePriceNaira - profitNaira;
    const tenorMonths: number = tc?.tenor_months ?? structure.tenorMonths;
    const monthlyInstallment = Math.round(salePriceNaira / tenorMonths);
    const schedule: string = tc?.repayment_schedule_description
      ?? `${fmt(monthlyInstallment)}/month over ${tenorMonths} months (sale price: ${fmt(salePriceNaira)})`;
    const disbursementConditions: string[] = tc?.disbursement_conditions ?? this.buildMitigations(snapshot, riskAssessment);

    const result: FinancingStructureResult = {
      proposedAmount: fmt(costPriceNaira),
      repaymentTerms: `Murabaha · Cost price ${fmt(costPriceNaira)} → Sale price ${fmt(salePriceNaira)} · Profit margin ${profitMarginPct.toFixed(0)}%`,
      paymentSchedule: schedule,
      riskMitigation: disbursementConditions.length > 0 ? disbursementConditions : this.buildMitigations(snapshot, riskAssessment),
      rationale: tc?.structuring_rationale
        ?? `Sale price ${fmt(salePriceNaira)} = ${structure.profitMarginPct.toFixed(0)}% of avg monthly GTV (${fmt(businessAnalysis.monthlyRevenueAverage)}). Monthly installment ${fmt(monthlyInstallment)} = ${(structure.affordabilityRatio * 100).toFixed(1)}% of monthly GTV — within the 20% affordability threshold.`,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: response.message || `Murabaha: Zalyx buys asset at ${fmt(costPriceNaira)}, sells to merchant at ${fmt(salePriceNaira)}. Repaid ${fmt(monthlyInstallment)}/month over ${tenorMonths} months.`,
      recommendation: `${fmt(costPriceNaira)} cost price · ${fmt(salePriceNaira)} sale price · ${tenorMonths} months`,
      confidence: Math.round((businessAnalysis.businessHealthScore + (100 - riskAssessment.overallRiskScore)) / 2),
    };

    return { result, debateMessage };
  }

  private buildMitigations(
    snapshot: ZalyxMerchantSnapshot,
    riskAssessment: RiskAssessmentResult
  ): string[] {
    const m: string[] = [];
    if (riskAssessment.overallRiskScore > 60) m.push("Reduced principal to limit exposure");
    if (snapshot.signals.period30d.activeDays < 5) m.push("Conditional on 15+ active days within 30 days of disbursement");
    if (snapshot.receivables.uncollectedNaira > 300000) m.push("Merchant to demonstrate receivables collection before disbursal");
    if (snapshot.ageInDays < 90) m.push("Short tenor (2–3 months) due to limited platform history");
    if (riskAssessment.concentrationRisk === "high") m.push("Merchant encouraged to diversify customer base");
    if (m.length === 0) m.push("Standard Murabaha terms — no additional conditions required");
    return m;
  }
}
