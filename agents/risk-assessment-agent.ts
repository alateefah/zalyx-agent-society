import { MerchantData, RiskAssessmentResult, AgentDebateMessage } from "../utils/types";
import { qwenClient } from "../utils/qwen-client";

export class RiskAssessmentAgent {
  agentName = "Risk Assessment Agent";
  agentRole =
    "Independently evaluates risk factors and challenges assumptions";

  async evaluate(merchantData: MerchantData): Promise<{
    result: RiskAssessmentResult;
    debateMessage: AgentDebateMessage;
  }> {
    const volatilityIndex = this.calculateVolatility(merchantData);
    const concentrationRisk = this.assessConcentrationRisk(merchantData);
    const operationalStability = this.assessOperationalStability(merchantData);
    const riskFactors = this.identifyRiskFactors(merchantData);

    const overallRiskScore = this.calculateRiskScore(
      volatilityIndex,
      operationalStability,
      riskFactors.length
    );

    const analysisPrompt = `
You are a risk officer evaluating merchant financing risk.
- Volatility Index: ${volatilityIndex}/100
- Concentration Risk: ${concentrationRisk}
- Operational Stability: ${operationalStability}/100
- Risk Factors Identified: ${riskFactors.length}
  ${riskFactors.map((f) => `- ${f}`).join("\n")}

Provide a professional risk assessment. Be conservative and challenge assumptions.
What specific risks concern you most?
`;

    const qwenResponse = await qwenClient.analyzeWithContext(
      analysisPrompt,
      JSON.stringify(merchantData, null, 2),
      this.agentName
    );

    const result: RiskAssessmentResult = {
      volatilityIndex,
      concentrationRisk,
      operationalStability,
      riskFactors,
      overallRiskScore,
      recommendation:
        overallRiskScore < 40
          ? "Low risk - approve with standard terms"
          : overallRiskScore < 70
            ? "Moderate risk - recommend conservative structure"
            : "High risk - recommend additional safeguards or rejection",
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: qwenResponse.message,
      recommendation: result.recommendation,
      confidence: 100 - overallRiskScore, // Lower risk = higher confidence in safety
    };

    return { result, debateMessage };
  }

  private calculateVolatility(merchantData: MerchantData): number {
    const incomeTransactions = merchantData.transactions.filter(
      (t) => t.type === "income"
    );

    if (incomeTransactions.length < 2) return 60; // Unknown volatility is concerning

    const amounts = incomeTransactions.map((t) => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avg;

    // Higher volatility = higher risk
    return Math.min(100, coefficientOfVariation * 50);
  }

  private assessConcentrationRisk(merchantData: MerchantData): string {
    const incomeTransactions = merchantData.transactions.filter(
      (t) => t.type === "income"
    );

    if (incomeTransactions.length === 0) return "high";

    // Check if a few transactions dominate total income
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const sorted = [...incomeTransactions].sort((a, b) => b.amount - a.amount);

    const topThreePercent =
      sorted.slice(0, 3).reduce((sum, t) => sum + t.amount, 0) / totalIncome;

    if (topThreePercent > 0.7) return "high";
    if (topThreePercent > 0.5) return "medium";
    return "low";
  }

  private assessOperationalStability(merchantData: MerchantData): number {
    const daysSinceRegistration = Math.floor(
      (new Date().getTime() - new Date(merchantData.registrationDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    let score = 50;

    // Businesses older than 1 year = more stable
    if (daysSinceRegistration > 365) score += 20;
    if (daysSinceRegistration > 730) score += 10;

    // Regular transaction history = stable
    const avgDaysBetweenTransactions =
      daysSinceRegistration / Math.max(1, merchantData.transactions.length);
    if (avgDaysBetweenTransactions < 5) score += 10;

    return Math.min(100, score);
  }

  private identifyRiskFactors(merchantData: MerchantData): string[] {
    const factors: string[] = [];

    // Check business age
    const daysSinceRegistration = Math.floor(
      (new Date().getTime() - new Date(merchantData.registrationDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysSinceRegistration < 90) {
      factors.push("New business (less than 3 months)");
    }

    // Check for transaction frequency gaps
    if (merchantData.transactions.length > 0) {
      const sortedDates = merchantData.transactions
        .map((t) => new Date(t.date).getTime())
        .sort((a, b) => a - b);

      let maxGap = 0;
      for (let i = 1; i < sortedDates.length; i++) {
        const gap = sortedDates[i] - sortedDates[i - 1];
        maxGap = Math.max(maxGap, gap);
      }

      const maxGapDays = Math.ceil(maxGap / (1000 * 60 * 60 * 24));
      if (maxGapDays > 30) {
        factors.push(
          `Extended inactivity period (${maxGapDays} days without transactions)`
        );
      }
    }

    // Check for negative profit margins
    const totalIncome = merchantData.transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = merchantData.transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    if (totalExpenses > totalIncome) {
      factors.push("Expenses exceed income");
    }

    return factors;
  }

  private calculateRiskScore(
    volatility: number,
    stability: number,
    riskFactorCount: number
  ): number {
    let score = 0;

    // Volatility contribution (0-40 points of risk)
    score += volatility * 0.4;

    // Stability contribution (negative = less stable = more risk)
    score += (100 - stability) * 0.4;

    // Risk factors contribution (0-20 points of risk)
    score += Math.min(20, riskFactorCount * 3);

    return Math.min(100, score);
  }
}
