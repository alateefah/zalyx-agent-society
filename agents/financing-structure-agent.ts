import {
  MerchantData,
  FinancingStructureResult,
  AgentDebateMessage,
  BusinessAnalysisResult,
  RiskAssessmentResult,
} from "../utils/types";
import { qwenClient } from "../utils/qwen-client";

export class FinancingStructureAgent {
  agentName = "Financing Structure Agent";
  agentRole = "Designs compliant financing terms based on analysis";

  async evaluate(
    merchantData: MerchantData,
    businessAnalysis: BusinessAnalysisResult,
    riskAssessment: RiskAssessmentResult
  ): Promise<{
    result: FinancingStructureResult;
    debateMessage: AgentDebateMessage;
  }> {
    // Calculate financing amount based on multiple factors
    const monthlyRevenue = businessAnalysis.monthlyRevenueAverage;
    const healthScore = businessAnalysis.businessHealthScore;
    const riskScore = riskAssessment.overallRiskScore;

    // Base amount = 3-6 months of revenue based on health
    const healthMultiplier = healthScore / 100;
    const baseAmount = monthlyRevenue * (3 + healthMultiplier * 3);

    // Risk adjustment
    const riskMultiplier = 1 - riskScore / 200; // Higher risk = lower amount
    const proposedAmount = baseAmount * riskMultiplier;

    // Determine repayment structure
    const { terms, schedule } = this.designRepaymentStructure(
      proposedAmount,
      riskScore,
      riskAssessment.riskFactors
    );

    const analysisPrompt = `
You are a fintech structuring specialist designing compliant financing terms.
- Proposed Amount: ${proposedAmount.toFixed(2)}
- Monthly Revenue: ${monthlyRevenue.toFixed(2)}
- Business Health: ${healthScore}/100
- Risk Assessment: ${riskScore}/100
- Repayment Terms: ${terms}
- Schedule: ${schedule}

Design a financing structure that is:
1. Fair to the merchant
2. Manageable based on their revenue
3. Protective of lender interests
4. Compliant with Islamic finance principles (no interest-based structures)

Explain your structuring rationale.
`;

    const qwenResponse = await qwenClient.analyzeWithContext(
      analysisPrompt,
      JSON.stringify(merchantData, null, 2),
      this.agentName
    );

    const result: FinancingStructureResult = {
      proposedAmount: `${proposedAmount.toFixed(2)}`,
      repaymentTerms: terms,
      paymentSchedule: schedule,
      riskMitigation: this.identifyMitigations(riskAssessment),
      rationale: `Based on revenue analysis (${monthlyRevenue.toFixed(2)}/month), business health (${healthScore}/100), and risk factors.`,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: qwenResponse.message,
      recommendation: `Structure: ${proposedAmount.toFixed(2)} with ${terms}`,
      confidence: 75, // Moderate confidence - depends on other agents
    };

    return { result, debateMessage };
  }

  private designRepaymentStructure(
    amount: number,
    riskScore: number,
    riskFactors: string[]
  ): { terms: string; schedule: string } {
    let months = 12;
    let structure = "Fixed monthly payments";

    // Adjust based on risk
    if (riskScore > 70) {
      months = 6;
      structure = "Accelerated payments with flexibility";
    } else if (riskScore > 40) {
      months = 9;
      structure = "Standard payments with seasonal adjustment";
    }

    // Check for seasonal risks
    if (riskFactors.includes("Extended inactivity period")) {
      structure += " with flexibility for low-activity periods";
    }

    const monthlyPayment = amount / months;
    const schedule = `${monthlyPayment.toFixed(2)}/month over ${months} months`;

    return { terms: structure, schedule };
  }

  private identifyMitigations(riskAssessment: RiskAssessmentResult): string[] {
    const mitigations: string[] = [];

    if (riskAssessment.volatilityIndex > 60) {
      mitigations.push("Flexible payment schedule to handle volatility");
    }

    if (riskAssessment.concentrationRisk === "high") {
      mitigations.push("Reduced financing amount to limit exposure");
    }

    if (riskAssessment.riskFactors.length > 0) {
      mitigations.push("Regular check-in requirements with merchant");
    }

    if (riskAssessment.operationalStability < 60) {
      mitigations.push("Shorter initial term with renewal option");
    }

    if (mitigations.length === 0) {
      mitigations.push("Standard terms apply with annual review");
    }

    return mitigations;
  }
}
