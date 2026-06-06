import { MerchantData, BusinessAnalysisResult, AgentDebateMessage } from "../utils/types";
import { qwenClient } from "../utils/qwen-client";

export class BusinessAnalysisAgent {
  agentName = "Business Analysis Agent";
  agentRole = "Analyzes business performance and financial health";

  async evaluate(merchantData: MerchantData): Promise<{
    result: BusinessAnalysisResult;
    debateMessage: AgentDebateMessage;
  }> {
    const incomeTransactions = merchantData.transactions.filter(
      (t) => t.type === "income"
    );
    const expenseTransactions = merchantData.transactions.filter(
      (t) => t.type === "expense"
    );

    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseTransactions.reduce(
      (sum, t) => sum + t.amount,
      0
    );
    const monthlyRevenueAverage = totalIncome / Math.max(1, incomeTransactions.length);
    const profitMargin = totalIncome - totalExpenses;

    const revenueStability = this.calculateStability(incomeTransactions);
    const transactionFrequency = merchantData.transactions.length;

    const businessHealthScore = this.calculateHealthScore(
      monthlyRevenueAverage,
      revenueStability,
      transactionFrequency,
      profitMargin
    );

    const analysisPrompt = `
You are a business analyst evaluating merchant financial health.
- Monthly Revenue Average: ${monthlyRevenueAverage.toFixed(2)}
- Revenue Stability: ${revenueStability}/100
- Transaction Frequency: ${transactionFrequency}
- Profit Margin: ${profitMargin.toFixed(2)}
- Business Health Score: ${businessHealthScore}/100

Provide a professional assessment of the merchant's financial health and business viability.
Include your recommendation for financing eligibility.
`;

    const qwenResponse = await qwenClient.analyzeWithContext(
      analysisPrompt,
      JSON.stringify(merchantData, null, 2),
      this.agentName
    );

    const result: BusinessAnalysisResult = {
      monthlyRevenueAverage,
      revenueStability,
      transactionFrequency,
      profitabilityIndicator:
        profitMargin > 0 ? "positive" : profitMargin === 0 ? "neutral" : "negative",
      businessHealthScore,
      recommendation:
        businessHealthScore > 70
          ? "Strong candidate for financing"
          : businessHealthScore > 50
            ? "Moderate candidate, requires additional review"
            : "High risk, additional scrutiny needed",
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: qwenResponse.message,
      recommendation: result.recommendation,
      confidence: businessHealthScore,
    };

    return { result, debateMessage };
  }

  private calculateStability(incomeTransactions: any[]): number {
    if (incomeTransactions.length < 2) return 50;

    const amounts = incomeTransactions.map((t) => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avg;

    // Lower CV = more stable (0.5 = quite stable, 2.0 = very volatile)
    return Math.max(0, Math.min(100, 100 - coefficientOfVariation * 30));
  }

  private calculateHealthScore(
    revenue: number,
    stability: number,
    frequency: number,
    profitMargin: number
  ): number {
    let score = 0;

    // Revenue contribution (max 30 points)
    const revenueScore = Math.min(30, (revenue / 1000) * 10);
    score += revenueScore;

    // Stability contribution (max 40 points)
    score += stability * 0.4;

    // Frequency contribution (max 20 points)
    score += Math.min(20, frequency * 0.5);

    // Profitability contribution (max 10 points)
    score += profitMargin > 0 ? 10 : 0;

    return Math.min(100, score);
  }
}
