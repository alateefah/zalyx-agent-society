// ── Legacy synthetic data (kept for backward compat) ─────────────────────────
export interface Transaction {
  date: string; // ISO format
  amount: number;
  type: "income" | "expense";
  description: string;
}

export interface MerchantData {
  id: string;
  businessName: string;
  businessType: string;
  registrationDate: string;
  transactions: Transaction[];
}

// ── Zalyx real-data snapshot ──────────────────────────────────────────────────
// Built from EligibilitySignal, EligibilityDecision, Order, OrderPayment tables.
// All monetary values in NGN (naira), converted from kobo at source.

export interface MonthlyRevenueBucket {
  month: string;           // "YYYY-MM"
  revenueNaira: number;
  orderCount: number;
  uniqueCustomers: number;
}

export interface EligibilitySignals {
  activeDays: number;
  totalOrders: number;
  avgDailyRevenueNaira: number;
  editRate: number;        // 0–1: fraction of orders edited after creation
  deleteRate: number;      // 0–1: fraction of orders deleted
  backdateRate: number;    // 0–1: fraction of orders backdated
  batchDays: number;       // days where orders were bulk-entered (fraud signal)
}

export interface ExistingDecision {
  score: number;           // 0–100
  tier: string;            // "A" | "B" | "C" etc.
  eligible: boolean;
  offerAmountNaira: number;
  fixedFeeNaira: number;
  tenorMonths: number;
  confidence: string;      // "HIGH" | "MED" | "LOW"
  asOfDate: string;
}

export interface ZalyxMerchantSnapshot {
  // Identity (anonymized for demo)
  id: string;
  businessName: string;
  businessType: string;
  ageInDays: number;

  // Order summary (lifetime)
  orders: {
    total: number;
    completed: number;
    cancelled: number;
    outstanding: number;
  };

  // Receivables — uncollected revenue on outstanding orders
  receivables: {
    outstandingOrders: number;
    totalOwedNaira: number;       // full price of outstanding orders
    totalCollectedNaira: number;  // partial payments already received
    uncollectedNaira: number;     // totalOwed - totalCollected
  };

  // Monthly revenue trend (most recent first)
  monthlyRevenue: MonthlyRevenueBucket[];

  // Pre-computed eligibility signals from Zalyx pipeline
  signals: {
    period30d: EligibilitySignals;
    period90d: Pick<EligibilitySignals, "activeDays" | "totalOrders" | "avgDailyRevenueNaira">;
  };

  // Zalyx system's existing decision (if already scored)
  existingDecision?: ExistingDecision;
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
  approvalAmount: string;       // formatted display string e.g. "₦271,006"
  approvedAmountNaira: number;  // raw number for DB storage and calculations
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
  // Debate round metadata
  messageType?: "position" | "challenge" | "rebuttal" | "verdict" | "summary";
  round?: number; // 1 = initial pass, 2 = debate exchange
}

// Single-Agent Baseline (for Track 3 comparison)
export interface BaselineReport {
  merchantId: string;
  executionTime: string;
  decision: "approved" | "rejected" | "requires-clarification";
  reasoning: string;
  proposedAmount: string;
  riskSummary: string;
  confidence: number;
  whatWasMissed?: string; // Populated during comparison — what the debate caught that baseline didn't
}

// SSE streaming event emitted by orchestrator after each agent stage
export type AgentProgressEvent =
  | { type: "stage_start";    stage: number | string; agentName: string }
  | { type: "stage_complete"; stage: number | string; agentName: string; debateMessage: AgentDebateMessage }
  | { type: "debate_start" }
  | { type: "done";   report: UnderwritingReport }
  | { type: "error";  message: string };

// ── Debate Ledger ─────────────────────────────────────────────────────────────

/**
 * A single disputed claim extracted from the agent debate.
 * The DebateModerator builds one DebateClaim per substantive disagreement
 * between the Business Analysis and Risk Assessment agents.
 */
export interface DebateClaim {
  claimId: string;                  // e.g. "risk-001", "risk-002"
  claim: string;                    // The Risk Agent's challenge (what it disputed)
  raisedBy: "Risk Assessment Agent";
  challengedAgent: "Business Analysis Agent";
  evidenceFor: string[];            // Evidence supporting the risk concern
  evidenceAgainst: string[];        // Evidence the Business Agent offered in rebuttal
  resolution:
    | "reframed_as_sector_normal"   // Concern accepted but context changes weight
    | "risk_concern_upheld"         // Risk Agent maintained the challenge
    | "claim_withdrawn"             // Risk Agent conceded after rebuttal
    | "compromise_condition_set"    // Resolved with a disbursement condition
    | "unresolved";                 // No clear resolution reached
  impact: string;                   // How this claim affected the final decision
}

/**
 * Full structured ledger of the agent negotiation.
 * Only populated when the debate round fires (health > 55 AND risk > 35).
 */
export interface DebateLedger {
  totalClaims: number;
  resolvedClaims: number;
  claimsUphelByRisk: number;
  claimsConcededByRisk: number;
  claims: DebateClaim[];
  negotiationSummary: string;       // One-paragraph plain-language summary
}

// ── Decision Delta ────────────────────────────────────────────────────────────

/**
 * Comparison between the single-agent baseline and the multi-agent outcome.
 * Attached to every report so judges see the measurable value-add immediately.
 */
export interface DecisionDelta {
  baselineDecision: "approved" | "rejected" | "requires-clarification";
  multiAgentDecision: "approved" | "rejected" | "requires-clarification";
  deltaType:
    | "same_decision"
    | "multi_more_conservative"
    | "multi_more_permissive";
  decisionChanged: boolean;
  reason: string;                   // Why they differ (or why same is still better)
  valueAdded: string[];             // What multi-agent surfaced that baseline didn't
  structuredOutputAdvantage: string; // Specific fields baseline lacks vs multi-agent
  baselineExecutionTime: string;
  multiAgentExecutionTime: string;
}

/**
 * Per-agent timing and call counts for observability.
 */
export interface AgentTiming {
  agentName: string;
  durationMs: number;
  qwenCallCount: number;  // Number of Qwen API calls this agent made
  mcpCallCount: number;   // Number of MCP tool calls this agent made
}

/**
 * Observability metadata attached to every underwriting run.
 */
export interface RunObservability {
  requestId: string;            // UUID for this underwriting run
  mockMode: boolean;            // True if running without a Qwen API key
  model: string;                // e.g. "qwen-max"
  totalQwenCalls: number;       // Across all agents
  totalMcpCalls: number;        // Across all agents
  agentTimings: AgentTiming[];  // Per-stage breakdown
  parallelStages: string[];     // Stages that ran in parallel (1+2)
  debateRoundFired: boolean;
  stage4Skipped: boolean;       // True if risk too high → financing skipped
}

/**
 * Formal record of a disagreement between the Business Analysis and Risk Assessment agents.
 * Populated only when the debate round fires (health > 55 AND risk > 35).
 */
export interface DebateResolution {
  triggered: boolean;
  trigger_reason: string;                    // Why the debate fired
  initial_health_score: number;              // Business Agent's score before debate
  initial_risk_score: number;                // Risk Agent's score before debate
  disputed_claims: string[];                 // Points the Risk Agent challenged
  business_agent_defense: string;            // Summary of the rebuttal
  risk_agent_final_position: string;         // Summary of the verdict
  resolution: "business_agent_prevailed" | "risk_agent_prevailed" | "compromise" | "no_change";
  resolution_summary: string;                // One sentence: what changed and why
  impact_on_decision: string;                // How the debate affected the final recommendation
}

/**
 * Partial report passed between stages during the pipeline run.
 * Does not yet have humanReview or observability (those are added at the end).
 */
export type IntermediateReport = Omit<UnderwritingReport, "humanReview" | "observability">;

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
  debateResolution?: DebateResolution;       // Only present when debate round fired
  debateLedger?: DebateLedger;              // Structured claim-by-claim negotiation record
  decisionDelta?: DecisionDelta;            // Baseline vs multi-agent comparison
  observability: RunObservability;           // Always present — audit trail
}
