import {
  ZalyxMerchantSnapshot,
  RiskAssessmentResult,
  AgentDebateMessage,
  BusinessAnalysisResult,
} from "../utils/types";
import { qwenClient, SUBMIT_RISK_VERDICT_TOOL } from "../utils/qwen-client";
import { mcpClient } from "../utils/mcp-client";
import { computeDeterministicRiskProfile } from "../utils/policy-metrics";

const fmt = (n: number) =>
  `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export class RiskAssessmentAgent {
  agentName = "Risk Assessment Agent";
  agentRole = "Independently evaluates credit risk and challenges optimistic assumptions";

  async evaluate(
    snapshot: ZalyxMerchantSnapshot,
    businessAnalysis: BusinessAnalysisResult
  ): Promise<{
    result: RiskAssessmentResult;
    debateMessage: AgentDebateMessage;
  }> {
    const risk = computeDeterministicRiskProfile(snapshot);
    const revenues = snapshot.monthlyRevenue.map(m => m.revenueNaira);

    // ── MCP Tool Call 3: Sector default rate ──────────────────────────────────
    let defaultRateContext = "Historical default rate data unavailable.";
    try {
      const riskTier: "low" | "moderate" | "high" =
        risk.overallRiskScore < 35 ? "low" : risk.overallRiskScore < 65 ? "moderate" : "high";
      const dr = await mcpClient.getSectorDefaultRate({
        business_type: snapshot.businessType,
        risk_tier: riskTier,
      });
      defaultRateContext = [
        `Historical default rate for ${snapshot.businessType} / ${riskTier} risk: ${dr.historical_default_rate_pct}%`,
        `Cross-sector average for ${riskTier} risk: ${dr.cross_sector_average_pct}%`,
        dr.interpretation,
        `Suggested minimum Murabaha profit margin: ${dr.suggested_murabaha_margin_floor}%`,
      ].join("\n");
      console.log(`   🔌 MCP get_sector_default_rate → ${dr.historical_default_rate_pct}% default rate for ${snapshot.businessType}/${riskTier}`);
    } catch (err) {
      console.warn("   ⚠️  MCP default rate unavailable — proceeding without portfolio context");
    }
    const currentYearMonthPrompt = new Date().toISOString().slice(0, 7);
    const latestEntryPrompt = snapshot.monthlyRevenue[snapshot.monthlyRevenue.length - 1];
    const latestIsPartialPrompt = latestEntryPrompt?.month >= currentYearMonthPrompt;
    const revenuesForPrompt = latestIsPartialPrompt && revenues.length > 2 ? revenues.slice(0, -1) : revenues;
    const peakRevenue = Math.max(...revenuesForPrompt);
    const latestRevenue = revenuesForPrompt[revenuesForPrompt.length - 1];
    const revenueDeclinePct = ((latestRevenue - peakRevenue) / peakRevenue) * 100;

    const prompt = `
You are a credit risk officer. Your job is to challenge the business analyst's assumptions and identify risks the optimistic view may have missed.

MERCHANT: ${snapshot.businessName} (${snapshot.businessType})
Platform age: ${snapshot.ageInDays} days

BUSINESS ANALYST'S VIEW:
- Business health score: ${businessAnalysis.businessHealthScore}/100
- Their recommendation: "${businessAnalysis.recommendation}"

YOUR RISK FINDINGS:

CREDIT & COLLECTIONS RISK:
- Outstanding receivables: ${fmt(snapshot.receivables.uncollectedNaira)} uncollected on ${snapshot.receivables.outstandingOrders} orders
- Receivables as % of total revenue: ${risk.receivablesRate.toFixed(1)}%
- Order completion rate: ${((snapshot.orders.completed / snapshot.orders.total) * 100).toFixed(0)}%

REVENUE RISK:
- Peak monthly revenue: ${fmt(peakRevenue)}
- Latest complete monthly revenue: ${fmt(latestRevenue)}
- Revenue vs peak: ${revenueDeclinePct >= 0 ? `+${revenueDeclinePct.toFixed(0)}%` : `${revenueDeclinePct.toFixed(0)}%`}
${latestIsPartialPrompt ? `- NOTE: ${latestEntryPrompt.month} is the current calendar month and is INCOMPLETE — do NOT use it to assess revenue decline` : ""}
- 30d avg daily revenue: ${fmt(snapshot.signals.period30d.avgDailyRevenueNaira)} vs 90d: ${fmt(snapshot.signals.period90d.avgDailyRevenueNaira)}

OPERATIONAL RISK:
- Active days last 30d: ${snapshot.signals.period30d.activeDays} (platform engagement)
- Business age: ${snapshot.ageInDays} days (${snapshot.ageInDays < 60 ? "EARLY STAGE — limited history" : snapshot.ageInDays < 90 ? "GROWING — some history" : "ESTABLISHED"})
- Months of data: ${snapshot.monthlyRevenue.length}

COMPUTED RISK PROFILE:
- Overall risk score: ${risk.overallRiskScore}/100 (higher = riskier)
- Concentration risk: ${risk.concentrationRisk}
- Risk factors: ${risk.riskFactors.length > 0 ? risk.riskFactors.join("; ") : "None identified"}

${snapshot.existingDecision ? `PRIOR ZALYX DECISION: Score ${snapshot.existingDecision.score}/100, ${snapshot.existingDecision.confidence} confidence, offer of ${fmt(snapshot.existingDecision.offerAmountNaira)}` : ""}

PORTFOLIO DEFAULT RATE (via MCP — real Zalyx historical data):
${defaultRateContext}

As the risk officer:
1. Where do you DISAGREE with the business analyst? Be specific.
2. Which risk factors concern you most and why?
3. What would make you more or less comfortable approving this merchant?
4. State your risk verdict: LOW RISK / MODERATE RISK / HIGH RISK.

Push back hard where warranted. The business analyst tends to be optimistic.
`;

    // Function calling — Qwen invokes submit_risk_verdict with structured output
    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Context:\n${JSON.stringify(snapshot, null, 2)}\n\nAnalysis request:\n${prompt}` }],
      [SUBMIT_RISK_VERDICT_TOOL],
      this.agentName
    );

    // Prefer structured tool output; fall back to computed values
    const tc = response.toolCall?.name === "submit_risk_verdict"
      ? (response.toolCall.arguments as any)
      : null;

    const riskFactors: string[] = risk.riskFactors;
    const overallRiskScore: number = risk.overallRiskScore;
    const riskLevel: string = (
      overallRiskScore < 35 ? "LOW" : overallRiskScore < 60 ? "MODERATE" : "HIGH"
    );

    const result: RiskAssessmentResult = {
      volatilityIndex: risk.volatilityIndex,
      concentrationRisk: risk.concentrationRisk,
      operationalStability: risk.operationalStability,
      riskFactors,
      overallRiskScore,
      recommendation: riskLevel === "LOW"
        ? "Low risk — standard terms appropriate"
        : riskLevel === "MODERATE"
          ? "Moderate risk — conservative structure and monitoring required"
          : "High risk — reject or require significant additional safeguards",
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: tc?.challenge_to_business_analyst
        ? `${response.message}\n\n**Risk verdict (${riskLevel}):** ${tc.challenge_to_business_analyst}`
        : response.message,
      recommendation: result.recommendation,
      confidence: 100 - overallRiskScore,
      messageType: "challenge",
      round: 1,
    };

    return { result, debateMessage };
  }

  // ── Debate Round 2: Issue final verdict after Business Agent rebuts ──────────
  async issueVerdict(
    snapshot: ZalyxMerchantSnapshot,
    riskResult: RiskAssessmentResult,
    businessRebuttal: string
  ): Promise<{ debateMessage: AgentDebateMessage }> {
    const prompt = `
You are the Risk Officer issuing your final verdict after the Business Analyst has responded to your challenge.

YOUR INITIAL RISK FINDING:
- Risk score: ${riskResult.overallRiskScore}/100
- Risk factors: ${riskResult.riskFactors.length > 0 ? riskResult.riskFactors.join("; ") : "None identified"}
- Your verdict: "${riskResult.recommendation}"

BUSINESS ANALYST'S REBUTTAL:
"${businessRebuttal}"

Issue your final position:
1. ACCEPT any points from the rebuttal that genuinely change your assessment — list them.
2. MAINTAIN the risk concerns that still hold despite their response — explain why.
3. State your FINAL RISK VERDICT: LOW / MODERATE / HIGH risk.
4. If you're willing to approve with conditions, state the specific conditions clearly.

Max 150 words. Be decisive — this is your last word.
`;

    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Context:\n${JSON.stringify({ snapshot, riskResult }, null, 2)}\n\nAnalysis request:\n${prompt}` }],
      [SUBMIT_RISK_VERDICT_TOOL],
      "Risk Assessment Agent (Verdict)"
    );

    const tc = response.toolCall?.name === "submit_risk_verdict"
      ? (response.toolCall.arguments as any)
      : null;

    const verdictSuffix = tc
      ? `\n\n**Final verdict (${tc.risk_level}):** ${tc.conditions_for_approval?.length
          ? "Conditions for approval: " + (tc.conditions_for_approval as string[]).join("; ")
          : "No conditions — I maintain rejection."}`
      : "";

    return {
      debateMessage: {
        agentName: this.agentName,
        agentRole: "Issuing final risk verdict after reviewing Business Analyst's rebuttal",
        timestamp: new Date().toISOString(),
        message: response.message + verdictSuffix,
        messageType: "verdict",
        round: 2,
      },
    };
  }

}
