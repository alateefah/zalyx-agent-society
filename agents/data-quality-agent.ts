import {
  ZalyxMerchantSnapshot,
  DataQualityResult,
  AgentDebateMessage,
} from "../utils/types";
import { qwenClient, SUBMIT_DATA_QUALITY_RESULT_TOOL } from "../utils/qwen-client";
import { mcpClient } from "../utils/mcp-client";

export class DataQualityAgent {
  agentName = "Data Quality Agent";
  agentRole = "Validates data integrity and flags quality issues before underwriting";

  async evaluate(snapshot: ZalyxMerchantSnapshot): Promise<{
    result: DataQualityResult;
    debateMessage: AgentDebateMessage;
  }> {
    const { completeness, consistency, anomalies } = this.scoreData(snapshot);
    const overallScore = Math.round((completeness + consistency) / 2);

    // ── MCP Tool Call 1: CBN compliance check ─────────────────────────────────
    let cbnStatus = "clear";
    let cbnDetails = "CBN compliance check passed.";
    let cbnCanProceed = true;
    try {
      const cbn = await mcpClient.checkCbnCompliance({
        merchant_id: snapshot.id,
        business_type: snapshot.businessType,
        business_name: snapshot.businessName,
      });
      cbnStatus = cbn.status;
      cbnDetails = cbn.details;
      cbnCanProceed = cbn.can_proceed;
      if (!cbnCanProceed) {
        anomalies.unshift(`⚠️ CBN COMPLIANCE BLOCK: ${cbnDetails}`);
      }
      console.log(`   🔌 MCP check_cbn_compliance → ${cbn.status}`);
    } catch (err) {
      console.warn("   ⚠️  MCP CBN check unavailable — proceeding without it");
    }

    const prompt = `
You are a data quality auditor at a fintech lending firm reviewing merchant data before underwriting.

MERCHANT PROFILE:
- Business: ${snapshot.businessName} (${snapshot.businessType})
- Age on platform: ${snapshot.ageInDays} days
- Months of transaction history: ${snapshot.monthlyRevenue.length}

DATA INTEGRITY SIGNALS (from platform audit pipeline):
- Edit rate: ${(snapshot.signals.period30d.editRate * 100).toFixed(1)}% (orders edited after creation — fraud proxy)
- Delete rate: ${(snapshot.signals.period30d.deleteRate * 100).toFixed(1)}% (orders deleted — data destruction signal)
- Backdate rate: ${(snapshot.signals.period30d.backdateRate * 100).toFixed(1)}% (orders entered with past dates — manipulation signal)
- Batch entry days: ${snapshot.signals.period30d.batchDays} days (bulk order entry — fake activity signal)

ACTIVITY CONSISTENCY:
- Active days (last 30): ${snapshot.signals.period30d.activeDays} of 30
- Active days (last 90): ${snapshot.signals.period90d.activeDays} of 90
- Total orders recorded: ${snapshot.orders.total}
- Computed completeness score: ${completeness}/100
- Computed consistency score: ${consistency}/100
CBN COMPLIANCE CHECK (via MCP):
- Status: ${cbnStatus.toUpperCase()}
- Can proceed: ${cbnCanProceed ? "YES" : "NO — BLOCK APPLICATION"}
- Details: ${cbnDetails}
${anomalies.length > 0 ? `\nFLAGS RAISED:\n${anomalies.map(a => `- ${a}`).join("\n")}` : "\nNo anomalies flagged — data appears clean."}

As a data quality auditor:
1. Is this data trustworthy enough to underwrite against? State clearly: PASS, CONDITIONAL PASS, or FAIL.
2. Call out specific integrity concerns if any exist.
3. Note what additional data would strengthen the application.

Be concise and direct. Underwriters are reading this.
`;

    // Function calling — Qwen returns structured quality assessment
    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Merchant data:\n${JSON.stringify(snapshot, null, 2)}\n\nAudit request:\n${prompt}` }],
      [SUBMIT_DATA_QUALITY_RESULT_TOOL],
      this.agentName
    );

    // Prefer structured tool output; fall back to computed scores
    const tc = response.toolCall?.name === "submit_data_quality_result"
      ? (response.toolCall.arguments as any)
      : null;

    const result: DataQualityResult = {
      completeness: tc?.completeness_score ?? completeness,
      consistency: tc?.consistency_score ?? consistency,
      anomalies: tc?.anomalies ?? anomalies,
      overallScore: tc?.overall_quality_score ?? overallScore,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: tc?.quality_notes ?? response.message,
      recommendation: tc?.proceed_recommendation ?? (cbnCanProceed ? "proceed" : "block"),
      confidence: result.overallScore,
      messageType: "position",
      round: 1,
    };

    return { result, debateMessage };
  }

  private scoreData(snapshot: ZalyxMerchantSnapshot): {
    completeness: number;
    consistency: number;
    anomalies: string[];
  } {
    const anomalies: string[] = [];
    const monthsOfData = snapshot.monthlyRevenue.length;
    const hasRecentActivity = snapshot.signals.period30d.activeDays > 0;
    const orderCount = snapshot.orders.total;

    // Completeness: richness of available data
    let completeness = 0;
    completeness += Math.min(monthsOfData / 3, 1) * 40;
    completeness += Math.min(orderCount / 20, 1) * 30;
    completeness += hasRecentActivity ? 20 : 0;
    completeness += snapshot.existingDecision ? 10 : 0;

    if (monthsOfData < 2) {
      anomalies.push(`Only ${monthsOfData} month(s) of transaction history — insufficient baseline for trend analysis`);
    }
    if (!hasRecentActivity) {
      anomalies.push("Zero activity in last 30 days — platform engagement unclear, possible churn");
    }
    if (orderCount < 10) {
      anomalies.push(`Low order volume (${orderCount} total) — limited data to assess behavioural patterns`);
    }

    // Consistency: signal cleanliness
    const { editRate, deleteRate, backdateRate, batchDays } = snapshot.signals.period30d;
    let consistency = 100;
    consistency -= editRate * 40;
    consistency -= deleteRate * 40;
    consistency -= backdateRate * 30;
    consistency -= Math.min(batchDays / 10, 1) * 20;

    if (editRate > 0.1) {
      anomalies.push(`Elevated edit rate (${(editRate * 100).toFixed(0)}%) — orders frequently modified after creation`);
    }
    if (deleteRate > 0.05) {
      anomalies.push(`Delete rate (${(deleteRate * 100).toFixed(0)}%) — order deletion detected`);
    }
    if (backdateRate > 0.1) {
      anomalies.push(`Backdate rate (${(backdateRate * 100).toFixed(0)}%) — possible historical record manipulation`);
    }
    if (batchDays > 3) {
      anomalies.push(`${batchDays} bulk-entry days — orders entered in batches, not organically`);
    }

    return {
      completeness: Math.round(Math.min(completeness, 100)),
      consistency: Math.round(Math.max(consistency, 0)),
      anomalies,
    };
  }
}
