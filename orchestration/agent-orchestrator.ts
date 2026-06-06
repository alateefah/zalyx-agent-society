import { MerchantData, UnderwritingReport, AgentDebateMessage } from "../utils/types";
import { DataQualityAgent } from "../agents/data-quality-agent";
import { BusinessAnalysisAgent } from "../agents/business-analysis-agent";
import { RiskAssessmentAgent } from "../agents/risk-assessment-agent";
import { FinancingStructureAgent } from "../agents/financing-structure-agent";
import { HumanReviewAgent } from "../agents/human-review-agent";

export class AgentOrchestrator {
  private dataQualityAgent: DataQualityAgent;
  private businessAnalysisAgent: BusinessAnalysisAgent;
  private riskAssessmentAgent: RiskAssessmentAgent;
  private financingStructureAgent: FinancingStructureAgent;
  private humanReviewAgent: HumanReviewAgent;

  constructor() {
    this.dataQualityAgent = new DataQualityAgent();
    this.businessAnalysisAgent = new BusinessAnalysisAgent();
    this.riskAssessmentAgent = new RiskAssessmentAgent();
    this.financingStructureAgent = new FinancingStructureAgent();
    this.humanReviewAgent = new HumanReviewAgent();
  }

  async runUnderwriting(merchantData: MerchantData): Promise<UnderwritingReport> {
    console.log(`\n📊 Starting underwriting for ${merchantData.businessName}...`);
    const startTime = new Date();
    const debateTranscript: AgentDebateMessage[] = [];

    try {
      // Stage 1: Data Quality Assessment
      console.log("🔍 Stage 1: Data Quality Assessment");
      const { result: dataQuality, debateMessage: dqMessage } =
        await this.dataQualityAgent.evaluate(merchantData);
      debateTranscript.push(dqMessage);
      console.log(
        `   ✓ Data Quality Score: ${dataQuality.overallScore.toFixed(1)}/100`
      );

      // Stage 2: Business Analysis
      console.log("📈 Stage 2: Business Analysis");
      const { result: businessAnalysis, debateMessage: baMessage } =
        await this.businessAnalysisAgent.evaluate(merchantData);
      debateTranscript.push(baMessage);
      console.log(
        `   ✓ Business Health Score: ${businessAnalysis.businessHealthScore.toFixed(1)}/100`
      );
      console.log(`   💬 ${businessAnalysis.recommendation}`);

      // Stage 3: Risk Assessment (can disagree with business analysis)
      console.log("⚠️  Stage 3: Risk Assessment");
      const { result: riskAssessment, debateMessage: raMessage } =
        await this.riskAssessmentAgent.evaluate(merchantData);
      debateTranscript.push(raMessage);
      console.log(
        `   ✓ Risk Score: ${riskAssessment.overallRiskScore.toFixed(1)}/100 (${riskAssessment.concentrationRisk} concentration risk)`
      );
      console.log(`   💬 ${riskAssessment.recommendation}`);

      // Debate point 1: Check for disagreement between health and risk
      if (
        businessAnalysis.businessHealthScore > 70 &&
        riskAssessment.overallRiskScore > 60
      ) {
        console.log(
          "   🤝 DEBATE: Business Agent bullish, Risk Agent cautious - will be reconciled in financing structure"
        );
      }

      // Stage 4: Financing Structure
      console.log("💰 Stage 4: Financing Structure Design");
      const { result: financingStructure, debateMessage: fsMessage } =
        await this.financingStructureAgent.evaluate(
          merchantData,
          businessAnalysis,
          riskAssessment
        );
      debateTranscript.push(fsMessage);
      console.log(`   ✓ Proposed Amount: ${financingStructure.proposedAmount}`);
      console.log(`   ✓ Terms: ${financingStructure.repaymentTerms}`);

      // Stage 5: Human Review
      console.log("👤 Stage 5: Human Review & Final Decision");

      const intermediateReport: Omit<UnderwritingReport, "humanReview"> = {
        merchantId: merchantData.id,
        executionTime: new Date().toISOString(),
        dataQuality,
        businessAnalysis,
        riskAssessment,
        financingStructure,
        debateTranscript,
      };

      const { result: humanReview, debateMessage: hrMessage } =
        await this.humanReviewAgent.review(intermediateReport);
      debateTranscript.push(hrMessage);
      console.log(
        `   ✓ Final Decision: ${humanReview.finalRecommendation.toUpperCase()}`
      );
      console.log(`   ✓ Approved Amount: ${humanReview.approvalAmount}`);

      const endTime = new Date();
      const executionTime = `${(endTime.getTime() - startTime.getTime()) / 1000}s`;

      return {
        merchantId: merchantData.id,
        executionTime,
        dataQuality,
        businessAnalysis,
        riskAssessment,
        financingStructure,
        humanReview,
        debateTranscript,
      };
    } catch (error) {
      console.error("❌ Error during underwriting:", error);
      throw error;
    }
  }
}
