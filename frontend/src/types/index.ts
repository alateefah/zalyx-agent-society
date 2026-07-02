// ── Merchant ──────────────────────────────────────────────────────────────────

export interface MonthlyRevenueBucket {
  month: string;
  revenueNaira: number;
  orderCount: number;
  uniqueCustomers: number;
}

export interface ZalyxMerchantSnapshot {
  id: string;
  businessName: string;
  businessType: string;
  ageInDays: number;
  orders: {
    total: number;
    completed: number;
    cancelled: number;
    outstanding: number;
  };
  receivables: {
    outstandingOrders: number;
    totalOwedNaira: number;
    totalCollectedNaira: number;
    uncollectedNaira: number;
  };
  monthlyRevenue: MonthlyRevenueBucket[];
  signals: {
    period30d: {
      activeDays: number;
      totalOrders: number;
      avgDailyRevenueNaira: number;
      editRate: number;
      deleteRate: number;
      backdateRate: number;
      batchDays: number;
    };
    period90d: {
      activeDays: number;
      totalOrders: number;
      avgDailyRevenueNaira: number;
    };
  };
  existingDecision?: {
    score: number;
    tier: string;
    eligible: boolean;
    offerAmountNaira: number;
    fixedFeeNaira: number;
    tenorMonths: number;
    confidence: string;
    asOfDate: string;
  };
}

// ── Agent results ─────────────────────────────────────────────────────────────

export interface DataQualityResult {
  completeness: number;
  consistency: number;
  anomalies: string[];
  overallScore: number;
}

export interface BusinessAnalysisResult {
  monthlyRevenueAverage: number;
  revenueStability: number;
  transactionFrequency: number;
  profitabilityIndicator: string;
  businessHealthScore: number;
  recommendation: string;
}

export interface RiskAssessmentResult {
  volatilityIndex: number;
  concentrationRisk: string;
  operationalStability: number;
  riskFactors: string[];
  overallRiskScore: number;
  recommendation: string;
}

export interface FinancingOfferRange {
  minCostPriceNaira: number;
  maxCostPriceNaira: number;
  recommendedCostPriceNaira: number;
  minSalePriceNaira: number;
  maxSalePriceNaira: number;
  recommendedSalePriceNaira: number;
  profitMarginPct: number;
  tenorMonths: number;
  customerSelectable: boolean;
  reviewCadence?: "monthly";
  reviewPeriod?: string;
  validFrom?: string;
  validUntil?: string;
  policyVersion?: string;
}

export interface FinancingStructureResult {
  proposedAmount: string;
  offerRange?: FinancingOfferRange;
  repaymentTerms: string;
  paymentSchedule: string;
  riskMitigation: string[];
  rationale: string;
}

export interface HumanReviewResult {
  finalRecommendation: "approved" | "rejected" | "requires-clarification";
  approvalAmount: string;
  approvedAmountNaira: number;
  approvedRange?: FinancingOfferRange;
  termsAdjustments: string;
  agentDebateNotes: string;
  reason: string;
}

// ── Debate ────────────────────────────────────────────────────────────────────

export interface AgentDebateMessage {
  agentName: string;
  agentRole: string;
  timestamp: string;
  message: string;
  recommendation?: string;
  confidence?: number;
  messageType?: "position" | "challenge" | "rebuttal" | "verdict" | "summary";
  round?: number;
}

export interface DebateClaim {
  claimId: string;
  claim: string;
  raisedBy: string;
  challengedAgent: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  resolution:
    | "reframed_as_sector_normal"
    | "risk_concern_upheld"
    | "claim_withdrawn"
    | "compromise_condition_set"
    | "unresolved";
  impact: string;
}

export interface DebateLedger {
  totalClaims: number;
  resolvedClaims: number;
  claimsUphelByRisk: number;
  claimsConcededByRisk: number;
  claims: DebateClaim[];
  negotiationSummary: string;
}

export interface DecisionDelta {
  baselineDecision: "approved" | "rejected" | "requires-clarification";
  multiAgentDecision: "approved" | "rejected" | "requires-clarification";
  deltaType: "same_decision" | "multi_more_conservative" | "multi_more_permissive";
  decisionChanged: boolean;
  reason: string;
  valueAdded: string[];
  structuredOutputAdvantage: string;
  baselineExecutionTime: string;
  multiAgentExecutionTime: string;
}

// ── Observability ─────────────────────────────────────────────────────────────

export interface AgentTiming {
  agentName: string;
  durationMs: number;
  qwenCallCount: number;
  mcpCallCount: number;
}

export interface RunObservability {
  requestId: string;
  mockMode: boolean;
  model: string;
  totalQwenCalls: number;
  totalMcpCalls: number;
  agentTimings: AgentTiming[];
  parallelStages: string[];
  debateRoundFired: boolean;
  stage4Skipped: boolean;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface UnderwritingReport {
  merchantId: string;
  executionTime: string;
  dataQuality: DataQualityResult;
  businessAnalysis: BusinessAnalysisResult;
  riskAssessment: RiskAssessmentResult;
  financingStructure: FinancingStructureResult;
  humanReview: HumanReviewResult;
  debateTranscript: AgentDebateMessage[];
  debateLedger?: DebateLedger;
  decisionDelta?: DecisionDelta;
  observability: RunObservability;
}

export interface BaselineReport {
  merchantId: string;
  executionTime: string;
  decision: "approved" | "rejected" | "requires-clarification";
  reasoning: string;
  proposedAmount: string;
  riskSummary: string;
  confidence: number;
}

// ── SSE events ────────────────────────────────────────────────────────────────

export type AgentProgressEvent =
  | { type: "stage_start"; stage: number | string; agentName: string }
  | { type: "stage_complete"; stage: number | string; agentName: string; debateMessage: AgentDebateMessage }
  | { type: "debate_start" }
  | { type: "done"; report: UnderwritingReport }
  | { type: "error"; message: string };

// ── Decision history ──────────────────────────────────────────────────────────

export interface DecisionHistoryEntry {
  merchantId: string;
  requestId: string;
  decision: "approved" | "rejected" | "requires-clarification";
  createdAt: string;
  approvedAmountNaira?: number;
  report: UnderwritingReport;
}

/** Lightweight summary returned by GET /api/merchants/:id/decisions — no report blob. */
export interface DecisionSummary {
  merchantId: string;
  requestId: string;
  decision: "approved" | "rejected" | "requires-clarification";
  createdAt: string;
  approvedAmountNaira?: number;
  approvedRange?: FinancingOfferRange;
  executionTime?: string;
}
