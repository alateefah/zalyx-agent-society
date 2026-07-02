import {
  ZalyxMerchantSnapshot,
  BusinessAnalysisResult,
  AgentDebateMessage,
} from "../utils/types";
import { qwenClient, SUBMIT_BUSINESS_POSITION_TOOL } from "../utils/qwen-client";
import { mcpClient } from "../utils/mcp-client";

const fmt = (n: number) =>
  `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export class BusinessAnalysisAgent {
  agentName = "Business Analysis Agent";
  agentRole = "Analyses business performance, revenue trajectory, and financing viability";

  async evaluate(snapshot: ZalyxMerchantSnapshot): Promise<{
    result: BusinessAnalysisResult;
    debateMessage: AgentDebateMessage;
  }> {
    const analysis = this.analyseRevenue(snapshot);

    // ── MCP Tool Call 2: Industry benchmarks ──────────────────────────────────
    let benchmarkContext = "Industry benchmark data unavailable.";
    try {
      const completionRate = snapshot.orders.total > 0
        ? (snapshot.orders.completed / snapshot.orders.total) * 100 : 0;
      const bench = await mcpClient.getIndustryBenchmarks({
        business_type: snapshot.businessType,
        merchant_monthly_gtv: analysis.monthlyRevenueAverage,
        merchant_active_days_30d: snapshot.signals.period30d.activeDays,
        merchant_completion_rate: completionRate,
      });
      benchmarkContext = [
        `Sector avg monthly GTV: ${fmt(bench.benchmarks.avgMonthlyGTVNaira)} | Median: ${fmt(bench.benchmarks.medianMonthlyGTVNaira)}`,
        bench.merchant_vs_sector ? `This merchant vs sector: ${bench.merchant_vs_sector.gtv_assessment}` : "",
        bench.active_days_context ?? "",
        bench.completion_rate_context ?? "",
        `Context: ${bench.benchmarks.description}`,
      ].filter(Boolean).join("\n");
      console.log(`   🔌 MCP get_industry_benchmarks → ${snapshot.businessType} benchmarks loaded`);
    } catch (err) {
      console.warn("   ⚠️  MCP benchmarks unavailable — proceeding without sector context");
    }

    const revenueRows = snapshot.monthlyRevenue
      .map(m => `  ${m.month}: ${fmt(m.revenueNaira)} (${m.orderCount} orders, ${m.uniqueCustomers} customers)`)
      .join("\n");

    const prompt = `
You are a business analyst at a fintech firm evaluating a merchant financing application.

MERCHANT: ${snapshot.businessName} (${snapshot.businessType})
Platform age: ${snapshot.ageInDays} days

REVENUE TREND (monthly, oldest → newest):
${revenueRows}

KEY METRICS:
- Monthly average revenue: ${fmt(analysis.monthlyRevenueAverage)}
- Revenue trend: ${analysis.revenueTrend > 0 ? `+${analysis.revenueTrend.toFixed(0)}%` : `${analysis.revenueTrend.toFixed(0)}%`} (latest vs earliest month)
- Avg daily revenue (30d): ${fmt(snapshot.signals.period30d.avgDailyRevenueNaira)}
- Avg daily revenue (90d): ${fmt(snapshot.signals.period90d.avgDailyRevenueNaira)}
- Order completion rate: ${analysis.completionRate.toFixed(0)}% (${snapshot.orders.completed}/${snapshot.orders.total} orders fully paid)
- Active days (30d): ${snapshot.signals.period30d.activeDays} | Active days (90d): ${snapshot.signals.period90d.activeDays}
- Unique customers: ${snapshot.monthlyRevenue.reduce((s, m) => s + m.uniqueCustomers, 0)} (across all months)
- Outstanding receivables: ${fmt(snapshot.receivables.uncollectedNaira)} on ${snapshot.receivables.outstandingOrders} orders
- Business health score (computed): ${analysis.businessHealthScore}/100

${snapshot.existingDecision ? `PRIOR ZALYX ELIGIBILITY SCORE: ${snapshot.existingDecision.score}/100 (Tier ${snapshot.existingDecision.tier}, ${snapshot.existingDecision.confidence} confidence)` : "No prior eligibility decision on file."}

SECTOR BENCHMARKS (via MCP — compare this merchant against sector peers):
${benchmarkContext}

As a business analyst:
1. Assess the revenue trajectory — is this business growing, declining, or stable?
2. Evaluate the completion rate and what it signals about customer payment behaviour.
3. State whether you believe this merchant is a strong, moderate, or weak candidate for financing and why.
4. Flag any context-specific patterns (e.g. seasonality, business type norms) that affect your assessment.

Speak with domain expertise. Be specific about the numbers.
`;

    // Function calling — Qwen returns structured business position
    const response = await qwenClient.chatWithTools(
      [{ role: "user", content: `Merchant data:\n${JSON.stringify(snapshot, null, 2)}\n\nAnalysis request:\n${prompt}` }],
      [SUBMIT_BUSINESS_POSITION_TOOL],
      this.agentName
    );

    // Prefer structured tool output; fall back to computed values
    const tc = response.toolCall?.name === "submit_business_position"
      ? (response.toolCall.arguments as any)
      : null;

    const result: BusinessAnalysisResult = {
      monthlyRevenueAverage: analysis.monthlyRevenueAverage,
      revenueStability: analysis.revenueStability,
      transactionFrequency: snapshot.signals.period90d.totalOrders,
      profitabilityIndicator: tc?.profitability_indicator ?? (analysis.completionRate > 80 ? "positive" : analysis.completionRate > 50 ? "neutral" : "negative"),
      businessHealthScore: analysis.businessHealthScore,
      recommendation: tc?.recommendation ?? (
        analysis.businessHealthScore > 70
          ? "Strong candidate — approve subject to risk review"
          : analysis.businessHealthScore > 50
            ? "Moderate candidate — conservative structure recommended"
            : "Weak candidate — clarification or rejection warranted"
      ),
    };

    const concerns = tc?.key_concerns ?? [];
    const strengths = tc?.key_strengths ?? [];
    const positionSummary = response.message ||
      `Health score: ${result.businessHealthScore}/100. ${strengths.slice(0, 2).join(". ")}. Concerns: ${concerns.slice(0, 2).join(". ")}.`;

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: positionSummary,
      recommendation: result.recommendation,
      confidence: result.businessHealthScore,
      messageType: "position",
      round: 1,
    };

    return { result, debateMessage };
  }

  // ── Debate Round 2: Respond to Risk Agent's challenge ────────────────────────
  async rebuttal(
    snapshot: ZalyxMerchantSnapshot,
    initialResult: BusinessAnalysisResult,
    riskChallenge: string
  ): Promise<{ debateMessage: AgentDebateMessage }> {
    const prompt = `
You are the Business Analyst in a live underwriting debate. The Risk Officer has challenged your assessment.

YOUR INITIAL POSITION:
- Business health score: ${initialResult.businessHealthScore}/100
- Recommendation: "${initialResult.recommendation}"

RISK OFFICER'S CHALLENGE:
"${riskChallenge}"

Respond directly and specifically:
1. CONCEDE any points where the Risk Officer is right — honest concessions strengthen your credibility.
2. DEFEND points where your analysis holds — cite specific numbers and business-type context.
3. If seasonality, industry norms, or payment patterns explain any risk flags, make that case now.
4. State whether your overall recommendation changes or holds.

Max 150 words. This is an active debate — be direct.
`;

    const response = await qwenClient.analyzeWithContext(
      prompt,
      JSON.stringify({ snapshot, initialAnalysis: initialResult }, null, 2),
      "Business Analysis Agent (Rebuttal)"
    );

    return {
      debateMessage: {
        agentName: this.agentName,
        agentRole: "Responding to Risk Officer — defending analysis, conceding where warranted",
        timestamp: new Date().toISOString(),
        message: response.message,
        messageType: "rebuttal",
        round: 2,
      },
    };
  }

  private analyseRevenue(snapshot: ZalyxMerchantSnapshot): {
    monthlyRevenueAverage: number;
    revenueStability: number;
    completionRate: number;
    revenueTrend: number;
    businessHealthScore: number;
  } {
    const revenues = snapshot.monthlyRevenue.map(m => m.revenueNaira);
    const monthlyRevenueAverage = revenues.reduce((s, r) => s + r, 0) / revenues.length;

    // Revenue trend: % change from first to last month
    const revenueTrend = revenues.length > 1
      ? ((revenues[revenues.length - 1] - revenues[0]) / revenues[0]) * 100
      : 0;

    // Revenue stability: inverse of coefficient of variation
    const mean = monthlyRevenueAverage;
    const variance = revenues.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / revenues.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;
    const revenueStability = Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));

    // Completion rate
    const completionRate = snapshot.orders.total > 0
      ? (snapshot.orders.completed / snapshot.orders.total) * 100
      : 0;

    // Health score (weighted)
    let score = 0;
    score += Math.min(snapshot.signals.period90d.activeDays / 30, 1) * 20; // Active days (up to 20)
    score += Math.min(snapshot.signals.period90d.totalOrders / 20, 1) * 15; // Order volume (up to 15)
    score += (completionRate / 100) * 25;                                    // Completion rate (up to 25)
    score += revenueStability / 100 * 20;                                    // Stability (up to 20)
    score += revenueTrend > 0 ? Math.min(revenueTrend / 200, 1) * 20 : 0;   // Growth trend (up to 20)

    return {
      monthlyRevenueAverage,
      revenueStability,
      completionRate,
      revenueTrend,
      businessHealthScore: Math.round(Math.min(score, 100)),
    };
  }
}
