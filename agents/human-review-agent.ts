import {
  HumanReviewResult,
  AgentDebateMessage,
  UnderwritingReport,
} from "../utils/types";
import { qwenClient } from "../utils/qwen-client";

export class HumanReviewAgent {
  agentName = "Human Review Agent";
  agentRole =
    "Synthesizes agent debate and produces final recommendation for human approval";

  async review(report: Omit<UnderwritingReport, "humanReview">): Promise<{
    result: HumanReviewResult;
    debateMessage: AgentDebateMessage;
  }> {
    // Analyze the debate
    const debateAnalysis = this.analyzeDebate(report.debateTranscript);

    // Synthesize recommendations
    const synthesisPrompt = `
You are conducting a human review of a merchant financing application.

AGENT RECOMMENDATIONS SUMMARY:
- Data Quality Score: ${report.dataQuality.overallScore}/100
  Issues: ${report.dataQuality.anomalies.join(", ") || "None"}

- Business Health: ${report.businessAnalysis.businessHealthScore}/100
  Recommendation: ${report.businessAnalysis.recommendation}

- Risk Assessment: ${report.riskAssessment.overallRiskScore}/100
  Risk Factors: ${report.riskAssessment.riskFactors.join(", ") || "None"}
  Recommendation: ${report.riskAssessment.recommendation}

- Proposed Financing: ${report.financingStructure.proposedAmount}
  Terms: ${report.financingStructure.repaymentTerms}
  Mitigations: ${report.financingStructure.riskMitigation.join(", ")}

AGENT DEBATE HIGHLIGHTS:
${debateAnalysis.keyDisagreements}

CONFLICTS IDENTIFIED:
${debateAnalysis.conflicts.length > 0 ? debateAnalysis.conflicts.join("\n") : "No major conflicts"}

Based on this analysis, provide a clear recommendation for the final underwriting decision.
Consider: merchant viability, risk factors, fairness, and compliance.
`;

    const qwenResponse = await qwenClient.analyzeWithContext(
      synthesisPrompt,
      JSON.stringify(report, null, 2),
      this.agentName
    );

    // Make the final call
    const finalRecommendation = this.makeRecommendation(
      report.businessAnalysis.businessHealthScore,
      report.riskAssessment.overallRiskScore,
      report.dataQuality.overallScore,
      debateAnalysis.conflicts.length
    );

    const result: HumanReviewResult = {
      finalRecommendation,
      approvalAmount:
        finalRecommendation === "approved"
          ? report.financingStructure.proposedAmount
          : finalRecommendation === "requires-clarification"
            ? `${(parseFloat(report.financingStructure.proposedAmount) * 0.7).toFixed(2)}`
            : "0",
      termsAdjustments: this.determineTermsAdjustments(report),
      agentDebateNotes: debateAnalysis.summary,
      reason: qwenResponse.message,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: qwenResponse.message,
      recommendation: `Final: ${finalRecommendation} at ${result.approvalAmount}`,
      confidence: this.calculateFinalConfidence(report),
    };

    return { result, debateMessage };
  }

  private analyzeDebate(debateTranscript: AgentDebateMessage[]): {
    keyDisagreements: string;
    conflicts: string[];
    summary: string;
  } {
    const recommendations = debateTranscript.map(
      (msg) => `${msg.agentName}: ${msg.recommendation}`
    );

    // Identify conflicting recommendations
    const conflicts: string[] = [];
    if (debateTranscript.length > 2) {
      const healthRec = debateTranscript.find((m) =>
        m.agentName.includes("Business")
      );
      const riskRec = debateTranscript.find((m) =>
        m.agentName.includes("Risk")
      );

      if (healthRec && riskRec) {
        if (
          healthRec.confidence &&
          riskRec.confidence &&
          Math.abs(healthRec.confidence - riskRec.confidence) > 30
        ) {
          conflicts.push(
            `Disagreement: ${healthRec.agentName} is bullish (${healthRec.confidence}/100) while ${riskRec.agentName} is cautious (${riskRec.confidence}/100)`
          );
        }
      }
    }

    return {
      keyDisagreements: recommendations.join("\n"),
      conflicts,
      summary: `Agents debated across ${debateTranscript.length} perspectives. ${conflicts.length > 0 ? "Significant disagreement noted." : "General consensus on approach."}`,
    };
  }

  private makeRecommendation(
    healthScore: number,
    riskScore: number,
    dataQuality: number,
    conflictCount: number
  ): "approved" | "rejected" | "requires-clarification" {
    // Data quality is a blocker
    if (dataQuality < 40) {
      return "requires-clarification";
    }

    // Strong health + low risk = approve
    if (healthScore > 70 && riskScore < 40) {
      return "approved";
    }

    // Moderate health + moderate risk = clarify
    if (healthScore > 50 && riskScore < 70) {
      if (conflictCount > 0) {
        return "requires-clarification";
      }
      return "approved";
    }

    // Low health or high risk = reject
    if (healthScore < 50 || riskScore > 70) {
      return "rejected";
    }

    return "requires-clarification";
  }

  private determineTermsAdjustments(
    report: Omit<UnderwritingReport, "humanReview">
  ): string {
    const adjustments: string[] = [];

    if (report.riskAssessment.overallRiskScore > 60) {
      adjustments.push("Reduce amount by 20-30%");
    }

    if (report.riskAssessment.concentrationRisk === "high") {
      adjustments.push("Request diversification plan from merchant");
    }

    if (report.riskAssessment.volatilityIndex > 70) {
      adjustments.push("Implement flexible payment schedules");
    }

    if (report.dataQuality.anomalies.length > 2) {
      adjustments.push("Require quarterly review until clarity achieved");
    }

    return adjustments.length > 0
      ? adjustments.join("; ")
      : "Standard terms apply";
  }

  private calculateFinalConfidence(
    report: Omit<UnderwritingReport, "humanReview">
  ): number {
    const avg =
      (report.businessAnalysis.businessHealthScore +
        (100 - report.riskAssessment.overallRiskScore) +
        report.dataQuality.overallScore) /
      3;

    return Math.round(avg);
  }
}
