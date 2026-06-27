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

4. FINANCING STRUCTURE (Proposed: ${report.financingStructure.proposedAmount})
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
2. If approved: confirm the amount and terms, and explain what tipped the balance.
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

    const tc = response.toolCall?.name === "issue_underwriting_decision"
      ? (response.toolCall.arguments as any)
      : null;

    // Use tool output for decision when available; fall back to rule-based
    const finalDecision: "approved" | "rejected" | "requires-clarification" =
      tc?.decision ?? recommendation;
    const approvedAmountNaira: number = tc?.approved_amount_naira ?? 0;
    const approvalAmount = tc
      ? (finalDecision === "rejected"
          ? "₦0 — Application not approved"
          : fmt(approvedAmountNaira))
      : this.determineApprovalAmount(report, recommendation);

    const underwriterRationale = tc?.decision_rationale_underwriter ?? response.message;
    const merchantRationale = tc?.decision_rationale_merchant ?? "";
    const whatDebateResolved = tc?.what_debate_resolved ?? "";
    const mandatoryConditions: string[] = tc?.mandatory_conditions ?? [];

    const combinedReason = [
      underwriterRationale,
      merchantRationale ? `\n\n**For merchant:** ${merchantRationale}` : "",
      whatDebateResolved ? `\n\n**What debate resolved:** ${whatDebateResolved}` : "",
    ].join("").trim();

    const result: HumanReviewResult = {
      finalRecommendation: finalDecision,
      approvalAmount,
      approvedAmountNaira: finalDecision === "rejected" ? 0 : approvedAmountNaira,
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
    if (recommendation === "requires-clarification") {
      // Offer reduced amount pending clarification
      const proposed = report.financingStructure.proposedAmount;
      return `Provisional ${proposed} (pending clarification)`;
    }
    return report.financingStructure.proposedAmount;
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
