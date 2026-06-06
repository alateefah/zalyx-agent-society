// Merchant Data Structure
export interface Transaction {
  date: string; // ISO format
  amount: number;
  type: "income" | "expense";
  description: string;
}

export interface MerchantData {
  id: string;
  businessName: string;
  businessType: string; // "retail", "services", "food", etc.
  registrationDate: string;
  transactions: Transaction[];
}

// Agent Evaluation Results
export interface DataQualityResult {
  completeness: number; // 0-100
  consistency: number; // 0-100
  anomalies: string[];
  overallScore: number; // 0-100
}

export interface BusinessAnalysisResult {
  monthlyRevenueAverage: number;
  revenueStability: number; // 0-100
  transactionFrequency: number;
  profitabilityIndicator: string;
  businessHealthScore: number; // 0-100
  recommendation: string;
}

export interface RiskAssessmentResult {
  volatilityIndex: number; // 0-100, higher = more volatile
  concentrationRisk: string; // "high", "medium", "low"
  operationalStability: number; // 0-100
  riskFactors: string[];
  overallRiskScore: number; // 0-100
  recommendation: string;
}

export interface FinancingStructureResult {
  proposedAmount: string;
  repaymentTerms: string;
  paymentSchedule: string;
  riskMitigation: string[];
  rationale: string;
}

export interface HumanReviewResult {
  finalRecommendation: "approved" | "rejected" | "requires-clarification";
  approvalAmount: string;
  termsAdjustments: string;
  agentDebateNotes: string;
  reason: string;
}

// Agent Debate Message
export interface AgentDebateMessage {
  agentName: string;
  agentRole: string;
  timestamp: string;
  message: string;
  recommendation?: string;
  confidence?: number; // 0-100
}

// Complete Underwriting Report
export interface UnderwritingReport {
  merchantId: string;
  executionTime: string;
  dataQuality: DataQualityResult;
  businessAnalysis: BusinessAnalysisResult;
  riskAssessment: RiskAssessmentResult;
  financingStructure: FinancingStructureResult;
  humanReview: HumanReviewResult;
  debateTranscript: AgentDebateMessage[];
}
