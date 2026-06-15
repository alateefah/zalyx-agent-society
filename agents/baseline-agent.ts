/**
 * Single-Agent Baseline
 *
 * This is the Track 3 comparison target. One LLM call with all merchant data,
 * no debate, no specialised agents. Used to demonstrate measurable efficiency
 * gain from the multi-agent debate architecture.
 */

import { ZalyxMerchantSnapshot, BaselineReport } from "../utils/types";
import { qwenClient } from "../utils/qwen-client";

const fmt = (n: number) =>
  `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export class BaselineAgent {
  agentName = "Baseline (Single Agent)";

  async evaluate(snapshot: ZalyxMerchantSnapshot): Promise<BaselineReport> {
    const startTime = Date.now();

    const revenues = snapshot.monthlyRevenue.map(m => m.revenueNaira);
    const avgRevenue = revenues.reduce((s, r) => s + r, 0) / revenues.length;
    const revenueRows = snapshot.monthlyRevenue
      .map(m => `  ${m.month}: ${fmt(m.revenueNaira)} (${m.orderCount} orders, ${m.uniqueCustomers} customers)`)
      .join("\n");

    const prompt = `
You are a merchant financing underwriter. Evaluate this merchant application and decide whether to APPROVE, REJECT, or ask for CLARIFICATION.

MERCHANT PROFILE:
- Business: ${snapshot.businessName} (${snapshot.businessType})
- Platform age: ${snapshot.ageInDays} days
- Total orders: ${snapshot.orders.total} (${snapshot.orders.completed} completed, ${snapshot.orders.cancelled} cancelled, ${snapshot.orders.outstanding} outstanding)

REVENUE HISTORY:
${revenueRows}
- Monthly average: ${fmt(avgRevenue)}

RECENT ACTIVITY:
- Active days (30d): ${snapshot.signals.period30d.activeDays}
- Active days (90d): ${snapshot.signals.period90d.activeDays}
- Orders (30d): ${snapshot.signals.period30d.totalOrders}
- Avg daily revenue (30d): ${fmt(snapshot.signals.period30d.avgDailyRevenueNaira)}

OUTSTANDING RECEIVABLES:
- Uncollected: ${fmt(snapshot.receivables.uncollectedNaira)} on ${snapshot.receivables.outstandingOrders} orders

${snapshot.existingDecision
  ? `EXISTING SYSTEM SCORE: ${snapshot.existingDecision.score}/100, Tier ${snapshot.existingDecision.tier}, ${snapshot.existingDecision.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}, offer ${fmt(snapshot.existingDecision.offerAmountNaira)}`
  : "No existing system decision."}

Based on this data, provide:
1. DECISION: APPROVED / REJECTED / REQUIRES CLARIFICATION
2. PROPOSED AMOUNT (if approved or provisional): specific naira figure with Murabaha fixed fee
3. RISK SUMMARY: 2-3 key risk factors you identified
4. REASONING: Why you reached this decision — be specific about the numbers

Keep your response under 200 words.
`;

    const response = await qwenClient.analyzeWithContext(
      prompt,
      JSON.stringify(snapshot, null, 2),
      this.agentName
    );

    const executionTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

    // Parse decision from response text
    const text = response.message.toUpperCase();
    let decision: BaselineReport["decision"] = "requires-clarification";
    if (text.includes("APPROVED") || text.includes("APPROVE:")) decision = "approved";
    else if (text.includes("REJECTED") || text.includes("REJECT:")) decision = "rejected";

    // Estimate a proposed amount from existingDecision or a conservative heuristic
    const proposedAmount = snapshot.existingDecision
      ? `${fmt(Math.round(snapshot.existingDecision.offerAmountNaira * 0.8))} (conservative — baseline estimate)`
      : decision === "approved"
        ? `${fmt(Math.round(avgRevenue * 0.5))} (1-month revenue, 50% factor)`
        : "₦0 — Not approved";

    // Confidence: rough heuristic based on data richness
    const confidence = Math.min(
      55 + (snapshot.monthlyRevenue.length * 5) + (snapshot.signals.period30d.activeDays > 5 ? 10 : 0),
      85
    );

    return {
      merchantId: snapshot.id,
      executionTime,
      decision,
      reasoning: response.message,
      proposedAmount,
      riskSummary: extractRiskSummary(response.message),
      confidence,
    };
  }
}

function extractRiskSummary(text: string): string {
  // Try to extract a RISK SUMMARY section if the LLM formatted it
  const match = text.match(/RISK SUMMARY[:\s]+([^\n.]+(?:[.\n][^\n.]+)?)/i);
  if (match) return match[1].trim().substring(0, 200);
  // Fallback: return first 150 chars of response
  return text.substring(0, 150) + "…";
}
