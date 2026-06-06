import { MerchantData, DataQualityResult, AgentDebateMessage } from "../utils/types";
import { qwenClient } from "../utils/qwen-client";

export class DataQualityAgent {
  agentName = "Data Quality Agent";
  agentRole = "Validates data integrity and flags quality issues";

  async evaluate(merchantData: MerchantData): Promise<{
    result: DataQualityResult;
    debateMessage: AgentDebateMessage;
  }> {
    // Basic validation logic (will call Qwen for sophisticated analysis)
    const completeness = this.checkCompleteness(merchantData);
    const consistency = this.checkConsistency(merchantData);
    const anomalies = this.detectAnomalies(merchantData);

    const overallScore = (completeness + consistency) / 2;

    const analysisPrompt = `
You are a data quality auditor. Review this merchant data and provide a professional assessment:
- Business: ${merchantData.businessName}
- Transaction Count: ${merchantData.transactions.length}
- Data Completeness: ${completeness}%
- Consistency Score: ${consistency}%
- Anomalies Detected: ${anomalies.length}

Provide a brief, professional assessment of data quality and fitness for underwriting.
`;

    const qwenResponse = await qwenClient.analyzeWithContext(
      analysisPrompt,
      JSON.stringify(merchantData, null, 2),
      this.agentName
    );

    const result: DataQualityResult = {
      completeness,
      consistency,
      anomalies,
      overallScore,
    };

    const debateMessage: AgentDebateMessage = {
      agentName: this.agentName,
      agentRole: this.agentRole,
      timestamp: new Date().toISOString(),
      message: qwenResponse.message,
      confidence: overallScore,
    };

    return { result, debateMessage };
  }

  private checkCompleteness(data: MerchantData): number {
    const requiredFields = [
      data.id,
      data.businessName,
      data.businessType,
      data.registrationDate,
    ];
    const filledFields = requiredFields.filter((f) => f && f.length > 0).length;
    const transactionsComplete = data.transactions.length > 0 ? 100 : 0;
    return (filledFields / requiredFields.length) * 50 + transactionsComplete * 0.5;
  }

  private checkConsistency(data: MerchantData): number {
    if (data.transactions.length < 2) return 50;

    // Check for date ordering and reasonable amounts
    let consistencyScore = 100;
    for (let i = 1; i < data.transactions.length; i++) {
      const prevDate = new Date(data.transactions[i - 1].date);
      const currDate = new Date(data.transactions[i].date);
      if (currDate < prevDate) {
        consistencyScore -= 5; // Date ordering issue
      }
    }

    return Math.max(consistencyScore, 50);
  }

  private detectAnomalies(data: MerchantData): string[] {
    const anomalies: string[] = [];

    // Check for extremely large transactions
    const avgAmount =
      data.transactions.reduce((sum, t) => sum + t.amount, 0) /
      data.transactions.length;
    const highAnomalies = data.transactions.filter(
      (t) => t.amount > avgAmount * 5
    ).length;

    if (highAnomalies > 0) {
      anomalies.push(`${highAnomalies} unusually large transactions detected`);
    }

    // Check for consistent activity
    if (data.transactions.length < 10) {
      anomalies.push("Limited transaction history");
    }

    return anomalies;
  }
}
