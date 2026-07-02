import {
  ZalyxMerchantSnapshot,
  HumanReviewResult,
  AgentDebateMessage,
  UnderwritingReport,
  IntermediateReport,
} from "../utils/types";
import { qwenClient, ISSUE_UNDERWRITING_DECISION_TOOL } from "../utils/qwen-client";

const fmt = (n: number) =>
  `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

function rangeLabel(report: IntermediateReport): string {
  const range = report.financingStructure.offerRange;
  return range
    ? `${fmt(range.minCostPriceNaira)}–${fmt(range.maxCostPriceNaira)}`
    : report.financingStructure.proposedAmount;
}

export class HumanReviewAgent {
  agentName = "Human Review Agent";
  agentRole = "Synthesises the full agent debate and makes the final underwriting decision";

  async review(
    report: IntermediateReport,
    snapshot: ZalyxMerchantSnapshot
  ): Promise<{
    result: HumanReviewResult;
    debateMessage: AgentDebateMessage;
  }> {
    const { conflicts, consensusLevel } = this.analyseDebate(report);
    const recommendation = this.makeRecommendation(report, snapshot);

    const prompt = `
You are the final human reviewer in a multi-agent merchant financing system at Zalyx, a Nigerian fintech platform.
You have read all four agent reports. Your job is to make the final call — APPROVE, REJECT, or REQUIRES CLARIFICATION — and explain your reasoning to the merchant in plain terms.

MERCHANT: ${snapshot.businessName} (${snapshot.businessType}), ${snapshot.ageInDays} days on platform

═══ AGENT DEBATE SUMMARY ═══

1. DATA QUALITY AGENT (Score: ${report.dataQuality.overallScore}/100)
   Completeness: ${report.dataQuality.completeness}/100 | Consistency: ${report.dataQuality.consistency}/100
   Flags: ${report.dataQuality.anomalies.length > 0 ? report.dataQuality.anomalies.join("; ") : "None"}

2. BUSINESS ANALYST (Health: ${report.businessAnalysis.businessHealthScore}/100)
   Avg monthly revenue: ${fmt(report.businessAnalysis.monthlyRevenueAverage)}
   Completion rate: ${report.businessAnalysis.profitabilityIndicator}
   Verdict: "${report.businessAnalysis.recommendation}"

3. RISK OFFICER (Risk: ${report.riskAssessment.overallRiskScore}/100)
   Risk factors: ${report.riskAssessment.riskFactors.length > 0 ? report.riskAssessment.riskFactors.join("; ") : "None"}
   Verdict: "${report.riskAssessment.recommendation}"

4. FINANCING STRUCTURE (Approved range: ${rangeLabel(report)})
   Terms: ${report.financingStructure.repaymentTerms}
   Schedule: ${report.financingStructure.paymentSchedule}
   Mitigations: ${report.financingStructure.riskMitigation.join("; ")}

DEBATE DYNAMICS:
- Consensus level: ${consensusLevel}
- Key conflicts: ${conflicts.length > 0 ? conflicts.join("; ") : "Agents broadly aligned"}

${snapshot.existingDecision ? `ZALYX SYSTEM PRIOR DECISION: Score ${snapshot.existingDecision.score}/100, Tier ${snapshot.existingDecision.tier}, ${snapshot.existingDecision.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}, offer ${fmt(snapshot.existingDecision.offerAmountNaira)} at ${fmt(snapshot.existingDecision.fixedFeeNaira)} fixed fee` : "No prior Zalyx system decision."}

COMPUTED FINAL RECOMMENDATION: ${recommendation.toUpperCase()}

As the final reviewer:
1. State your decision: APPROVED / REJECTED / REQUIRES CLARIFICATION.
2. If approved: confirm the deterministic approved range and explain the customer may choose any amount inside it. Do not choose a different single amount.
3. If rejected: explain specifically what would need to change for future approval.
4. If clarification needed: list exactly what information is missing.
5. Call out any context the other agents may have missed (business type norms, market context, etc.).

Write this for two audiences: the underwriting team (technical detail) and the merchant (plain English). Keep it under 200 words.
`;

    // Function calling — force Qwen to call issue_underwriting_decision (no text-only fallthrough)
    // This is the "money shot": what_debate_resolved explicitly names what multi-agent caught
    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Context:\n${JSON.stringify({ report, snapshot }, null, 2)}\n\nAnalysis request:\n${prompt}` }],
      [ISSUE_UNDERWRITING_DECISION_TOOL],
      this.agentName,
      undefined,
      "issue_underwriting_decision"
    );

    void response;

    // Policy owns the final decision and amount; Qwen contributes an auditable agent call.
    const finalDecision: "approved" | "rejected" | "requires-clarification" =
      recommendation;
    const approvedRange = report.financingStructure.offerRange;
    const approvedAmountNaira = finalDecision === "approved"
      ? approvedRange?.maxCostPriceNaira ?? this.parseNaira(report.financingStructure.proposedAmount)
      : 0;
    const approvalAmount = this.determineApprovalAmount(report, finalDecision);

    const mandatoryConditions: string[] = [];

    const combinedReason = this.buildDeterministicReason(
      report,
      snapshot,
      finalDecision,
      approvedRange,
      consensusLevel,
      conflicts,
      mandatoryConditions
    );

    const result: HumanReviewResult = {
      finalRecommendation: finalDecision,
      approvalAmount,
      approvedAmountNaira,
      approvedRange: finalDecision === "approved" ? approvedRange : undefined,
      termsAdjustments: mandatoryConditions.length > 0
        ? mandatoryConditions.join("; ")
        : this.determineAdjustments(report, snapshot, finalDecision),
      agentDebateNotes: `${consensusLevel}. ${conflicts.length > 0 ? `Key conflict: ${conflicts[0]}` : "Agents broadly aligned on assessment."}`,
      reason: combinedReason || response.message,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: combinedReason || response.message,
      recommendation: `${finalDecision.toUpperCase()} — ${approvalAmount}`,
      confidence: this.finalConfidence(report),
    };

    return { result, debateMessage };
  }

  private makeRecommendation(
    report: IntermediateReport,
    snapshot: ZalyxMerchantSnapshot
  ): "approved" | "rejected" | "requires-clarification" {
    const { overallScore: dq } = report.dataQuality;
    const { businessHealthScore: health } = report.businessAnalysis;
    const { overallRiskScore: risk } = report.riskAssessment;

    // Hard blocks
    if (dq < 30) return "requires-clarification"; // Data too sparse to decide
    if (snapshot.signals.period30d.activeDays === 0 && snapshot.monthlyRevenue.length < 2) return "rejected";
    if (risk > 70 && health < 40) return "rejected";

    // If Zalyx system already says eligible + agents agree = approve
    if (snapshot.existingDecision?.eligible && health > 60 && risk < 50) return "approved";

    // Standard logic — risk < 65 covers moderate-risk merchants with strong health
    if (health > 65 && risk < 65) return "approved";
    if (health > 45 && risk < 75) return "requires-clarification";
    return "rejected";
  }

  private determineApprovalAmount(
    report: IntermediateReport,
    recommendation: string
  ): string {
    if (recommendation === "rejected") return "₦0 — Application not approved";
    const range = report.financingStructure.offerRange;
    if (range && recommendation === "approved") {
      return `${fmt(range.minCostPriceNaira)}–${fmt(range.maxCostPriceNaira)} approved range`;
    }
    if (recommendation === "requires-clarification") {
      return `Range pending clarification: ${report.financingStructure.proposedAmount}`;
    }
    return report.financingStructure.proposedAmount;
  }

  private parseNaira(value: string): number {
    const match = value.match(/[\d,]+/);
    return match ? Number(match[0].replace(/,/g, "")) : 0;
  }

  private determineAdjustments(
    report: IntermediateReport,
    snapshot: ZalyxMerchantSnapshot,
    recommendation: string
  ): string {
    const adj: string[] = [];
    if (report.riskAssessment.overallRiskScore > 50) adj.push("Monthly check-in with merchant required");
    if (snapshot.signals.period30d.activeDays < 5) adj.push("Disbursement conditional on 15+ active days post-approval");
    if (snapshot.receivables.uncollectedNaira > 500000) adj.push("Merchant to collect 50% of outstanding receivables before disbursal");
    if (recommendation === "requires-clarification") adj.push("Resubmit with 90 days of activity data");
    return adj.length > 0 ? adj.join("; ") : "No adjustments — standard terms apply";
  }

  private buildDeterministicReason(
    report: IntermediateReport,
    snapshot: ZalyxMerchantSnapshot,
    decision: "approved" | "rejected" | "requires-clarification",
    range: IntermediateReport["financingStructure"]["offerRange"],
    consensusLevel: string,
    conflicts: string[],
    mandatoryConditions: string[]
  ): string {
    const common =
      `${consensusLevel}. Data quality scored ${report.dataQuality.overallScore}/100, business health scored ${report.businessAnalysis.businessHealthScore}/100, and risk scored ${report.riskAssessment.overallRiskScore}/100.`;

    if (decision === "approved" && range) {
      const conditions = mandatoryConditions.length > 0
        ? mandatoryConditions.join("; ")
        : report.financingStructure.riskMitigation.join("; ");
      return [
        `${common} The approved investment range is ${fmt(range.minCostPriceNaira)}–${fmt(range.maxCostPriceNaira)}. This range is policy-calculated from average monthly GTV, risk tier, fixed Murabaha margin, tenor, and the 20% installment affordability cap.`,
        `The merchant can choose any amount inside the range; Zalyx does not ask the model to pick a single principal. The corresponding sale price range is ${fmt(range.minSalePriceNaira)}–${fmt(range.maxSalePriceNaira)} over ${range.tenorMonths} months at a fixed ${range.profitMarginPct.toFixed(0)}% Murabaha margin.`,
        range.reviewPeriod && range.validUntil
          ? `This is the ${range.reviewPeriod} monthly review offer and is valid through ${range.validUntil}. Rerunning underwriting inside the same review period should explain the same range, not search for a better amount.`
          : "",
        conditions ? `Conditions before disbursement: ${conditions}.` : "",
        conflicts.length > 0 ? `What debate resolved: ${conflicts[0]}.` : `What debate resolved: agents broadly aligned after reviewing ${snapshot.businessType} context.`,
      ].filter(Boolean).join("\n\n");
    }

    if (decision === "requires-clarification") {
      return `${common} The application needs clarification before an approved range can be finalized. Missing or contested evidence should be resolved before disbursement.`;
    }

    return `${common} The application is rejected because risk remains too high relative to business health and data quality. No investment range is approved.`;
  }

  private analyseDebate(report: IntermediateReport): {
    conflicts: string[];
    consensusLevel: string;
  } {
    const conflicts: string[] = [];
    const health = report.businessAnalysis.businessHealthScore;
    const risk = report.riskAssessment.overallRiskScore;

    if (health > 70 && risk > 50) {
      conflicts.push(`Business Analyst bullish (${health}/100) while Risk Officer cautious (${risk}/100 risk)`);
    }
    if (report.dataQuality.anomalies.length > 0 && health > 65) {
      conflicts.push("Data Quality raised flags that Business Analyst's score doesn't fully reflect");
    }

    const consensusLevel = conflicts.length === 0
      ? "Strong consensus across all agents"
      : conflicts.length === 1
        ? "Moderate disagreement between agents"
        : "Significant disagreement — careful human judgement required";

    return { conflicts, consensusLevel };
  }

  private finalConfidence(report: IntermediateReport): number {
    return Math.round(
      (report.businessAnalysis.businessHealthScore +
        (100 - report.riskAssessment.overallRiskScore) +
        report.dataQuality.overallScore) / 3
    );
  }
}
