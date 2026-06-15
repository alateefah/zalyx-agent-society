import { randomUUID } from "crypto";
import {
  ZalyxMerchantSnapshot,
  UnderwritingReport,
  AgentDebateMessage,
  AgentProgressEvent,
  DebateResolution,
  DebateLedger,
  DecisionDelta,
  AgentTiming,
  RunObservability,
} from "../utils/types";
import { DataQualityAgent } from "../agents/data-quality-agent";
import { BusinessAnalysisAgent } from "../agents/business-analysis-agent";
import { RiskAssessmentAgent } from "../agents/risk-assessment-agent";
import { FinancingStructureAgent } from "../agents/financing-structure-agent";
import { HumanReviewAgent } from "../agents/human-review-agent";
import { BaselineAgent } from "../agents/baseline-agent";
import { debateModerator } from "../agents/debate-moderator";
import { qwenClient } from "../utils/qwen-client";

export class AgentOrchestrator {
  private dataQualityAgent = new DataQualityAgent();
  private businessAnalysisAgent = new BusinessAnalysisAgent();
  private baselineAgent = new BaselineAgent(); // Run in parallel for DecisionDelta
  private riskAssessmentAgent = new RiskAssessmentAgent();
  private financingStructureAgent = new FinancingStructureAgent();
  private humanReviewAgent = new HumanReviewAgent();

  async runUnderwriting(
    snapshot: ZalyxMerchantSnapshot,
    onProgress?: (event: AgentProgressEvent) => void
  ): Promise<UnderwritingReport> {
    const emit = (event: AgentProgressEvent) => {
      if (onProgress) onProgress(event);
    };

    console.log(`\n📊 Starting underwriting for ${snapshot.businessName} (${snapshot.businessType})...`);
    const requestId = randomUUID();
    const startTime = Date.now();
    const debateTranscript: AgentDebateMessage[] = [];
    const agentTimings: AgentTiming[] = [];
    qwenClient.resetCallCount();
    let runningQwenCalls = 0;

    // Run baseline in parallel with Stage 1+2 for DecisionDelta (fire-and-forget)
    const baselinePromise = this.baselineAgent.evaluate(snapshot).catch(() => null);

    // Helper: time a stage call and record its metrics
    const timed = async <T>(
      agentName: string,
      mcpCalls: number,
      fn: () => Promise<T>
    ): Promise<T> => {
      const t0 = Date.now();
      const callsBefore = qwenClient.getCallCount();
      const result = await fn();
      const callsAfter = qwenClient.getCallCount();
      const durationMs = Date.now() - t0;
      const qwenCallCount = callsAfter - callsBefore;
      agentTimings.push({ agentName, durationMs, qwenCallCount, mcpCallCount: mcpCalls });
      runningQwenCalls = callsAfter;
      return result;
    };

    // ── Stage 1 + 2: Parallel (Data Quality & Business Analysis) ─────────────
    console.log("🔍 Stage 1+2: Data Quality + Business Analysis (parallel)");
    emit({ type: "stage_start", stage: 1, agentName: "Data Quality Agent" });
    emit({ type: "stage_start", stage: 2, agentName: "Business Analysis Agent" });

    const [
      { result: dataQuality, debateMessage: dqMsg },
      { result: businessAnalysis, debateMessage: baMsg },
    ] = await Promise.all([
      timed("Data Quality Agent", 1, () => this.dataQualityAgent.evaluate(snapshot)),
      timed("Business Analysis Agent", 1, () => this.businessAnalysisAgent.evaluate(snapshot)),
    ]);

    debateTranscript.push(dqMsg);
    emit({ type: "stage_complete", stage: 1, agentName: "Data Quality Agent", debateMessage: dqMsg });

    debateTranscript.push(baMsg);
    emit({ type: "stage_complete", stage: 2, agentName: "Business Analysis Agent", debateMessage: baMsg });

    console.log(`   ✓ Quality Score: ${dataQuality.overallScore}/100 | Health: ${businessAnalysis.businessHealthScore}/100`);

    // ── Stage 3: Risk Assessment (challenges Business Analysis) ───────────────
    console.log("⚠️  Stage 3: Risk Assessment");
    emit({ type: "stage_start", stage: 3, agentName: "Risk Assessment Agent" });

    const { result: riskAssessment, debateMessage: raMsg } =
      await timed("Risk Assessment Agent", 1, () => this.riskAssessmentAgent.evaluate(snapshot, businessAnalysis));
    debateTranscript.push(raMsg);
    emit({ type: "stage_complete", stage: 3, agentName: "Risk Assessment Agent", debateMessage: raMsg });
    console.log(`   ✓ Risk Score: ${riskAssessment.overallRiskScore}/100 (${riskAssessment.concentrationRisk} concentration)`);

    // ── Stage 3b/3c: Debate round 2 ───────────────────────────────────────────
    const debating = businessAnalysis.businessHealthScore > 55 && riskAssessment.overallRiskScore > 35;
    let debateResolution: DebateResolution | undefined;

    if (debating) {
      emit({ type: "debate_start" });

      console.log("🔄 Stage 3b: Business Agent Rebuttal (debate round 2)");
      emit({ type: "stage_start", stage: "3b", agentName: "Business Analysis Agent" });
      const { debateMessage: rebuttalMsg } = await timed("Business Analysis Agent (Rebuttal)", 0, () =>
        this.businessAnalysisAgent.rebuttal(snapshot, businessAnalysis, raMsg.message)
      );
      debateTranscript.push(rebuttalMsg);
      emit({ type: "stage_complete", stage: "3b", agentName: "Business Analysis Agent", debateMessage: rebuttalMsg });
      console.log("   ✓ Business Agent defended position");

      console.log("⚖️  Stage 3c: Risk Agent Final Verdict (debate round 2)");
      emit({ type: "stage_start", stage: "3c", agentName: "Risk Assessment Agent" });
      const { debateMessage: verdictMsg } = await timed("Risk Assessment Agent (Verdict)", 0, () =>
        this.riskAssessmentAgent.issueVerdict(snapshot, riskAssessment, rebuttalMsg.message)
      );
      debateTranscript.push(verdictMsg);
      emit({ type: "stage_complete", stage: "3c", agentName: "Risk Assessment Agent", debateMessage: verdictMsg });
      console.log("   ✓ Risk Agent issued final verdict");

      // ── Build formal debate resolution record ───────────────────────────────
      // Determine resolution direction based on whether the Risk Agent conceded
      // or maintained its challenge after the Business Agent rebuttal.
      const verdictLower = verdictMsg.message.toLowerCase();
      const riskConceded =
        verdictLower.includes("concede") ||
        verdictLower.includes("accept") ||
        verdictLower.includes("revise") ||
        verdictLower.includes("lower") ||
        verdictLower.includes("reduced");
      const compromise =
        verdictLower.includes("partial") ||
        verdictLower.includes("condition") ||
        verdictLower.includes("mitigat");
      const resolution =
        riskConceded ? "business_agent_prevailed"
        : compromise ? "compromise"
        : "risk_agent_prevailed";

      // Extract disputed claims from the Risk Agent's initial challenge (raMsg)
      const riskChallenge = raMsg.message;
      const disputedClaims = riskChallenge
        .split(/[.!?]/)
        .filter((s) => s.match(/concern|flag|risk|issue|question|unusual|anomal|low|high|missing/i))
        .map((s) => s.trim())
        .filter((s) => s.length > 10)
        .slice(0, 4);

      debateResolution = {
        triggered: true,
        trigger_reason: `Business health score (${businessAnalysis.businessHealthScore}) > 55 AND risk score (${riskAssessment.overallRiskScore}) > 35 — agents had conflicting assessments`,
        initial_health_score: businessAnalysis.businessHealthScore,
        initial_risk_score: riskAssessment.overallRiskScore,
        disputed_claims: disputedClaims.length > 0 ? disputedClaims : [riskChallenge.slice(0, 200)],
        business_agent_defense: rebuttalMsg.message.slice(0, 400),
        risk_agent_final_position: verdictMsg.message.slice(0, 400),
        resolution,
        resolution_summary:
          resolution === "business_agent_prevailed"
            ? "Risk Agent accepted the Business Agent's contextual explanation and revised its position."
            : resolution === "compromise"
            ? "Agents reached a conditional position — approval with risk-mitigating disbursement conditions."
            : "Risk Agent maintained its challenge; concerns were unresolved and carry into the final decision.",
        impact_on_decision:
          "See Human Review Agent's final recommendation — the debate outcome is a key input to the final decision.",
      };
    } else {
      console.log("   → Agents aligned — no rebuttal round needed");
      debateResolution = {
        triggered: false,
        trigger_reason: `Agents aligned: health score ${businessAnalysis.businessHealthScore} ${businessAnalysis.businessHealthScore <= 55 ? "≤ 55" : "> 55 but"} risk score ${riskAssessment.overallRiskScore} ${riskAssessment.overallRiskScore <= 35 ? "≤ 35" : ""}`,
        initial_health_score: businessAnalysis.businessHealthScore,
        initial_risk_score: riskAssessment.overallRiskScore,
        disputed_claims: [],
        business_agent_defense: "",
        risk_agent_final_position: "",
        resolution: "no_change",
        resolution_summary: "No debate — agents' assessments were aligned. No rebuttal round needed.",
        impact_on_decision: "Human Review Agent decides based on Stage 1–3 outputs with no further argument.",
      };
    }

    // ── Stage 4: Financing Structure (skip if risk score makes approval impossible) ──
    const likelyRejection = riskAssessment.overallRiskScore >= 80 && businessAnalysis.businessHealthScore < 50;
    let financingStructure: import("../utils/types").FinancingStructureResult;
    if (likelyRejection) {
      console.log("⏭️  Stage 4: Skipped — risk too high for financing");
      financingStructure = {
        proposedAmount: "₦0",
        repaymentTerms: "N/A — application not approved",
        paymentSchedule: "N/A",
        riskMitigation: [],
        rationale: "Financing structure not computed — application did not meet minimum eligibility criteria.",
      };
    } else {
      console.log("💰 Stage 4: Financing Structure Design");
      emit({ type: "stage_start", stage: 4, agentName: "Financing Structure Agent" });
      const { result: fs, debateMessage: fsMsg } =
        await timed("Financing Structure Agent", 0, () =>
          this.financingStructureAgent.evaluate(snapshot, businessAnalysis, riskAssessment)
        );
      financingStructure = fs;
      debateTranscript.push(fsMsg);
      emit({ type: "stage_complete", stage: 4, agentName: "Financing Structure Agent", debateMessage: fsMsg });
      console.log(`   ✓ Proposed: ${financingStructure.proposedAmount}`);
    }

    // ── Stage 5: Human Review ─────────────────────────────────────────────────
    console.log("👤 Stage 5: Human Review & Final Decision");
    emit({ type: "stage_start", stage: 5, agentName: "Human Review Agent" });

    // Partial report passed to Human Review — observability is filled after all stages complete
    const intermediateReport: import("../utils/types").IntermediateReport = {
      merchantId: snapshot.id,
      executionTime: "",
      dataQuality,
      businessAnalysis,
      riskAssessment,
      financingStructure,
      debateTranscript,
    };

    const { result: humanReview, debateMessage: hrMsg } =
      await timed("Human Review Agent", 0, () =>
        this.humanReviewAgent.review(intermediateReport, snapshot)
      );
    debateTranscript.push(hrMsg);
    emit({ type: "stage_complete", stage: 5, agentName: "Human Review Agent", debateMessage: hrMsg });
    console.log(`   ✓ Final Decision: ${humanReview.finalRecommendation.toUpperCase()}`);

    const executionTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;

    // ── Debate Ledger (deterministic moderator) ───────────────────────────────
    const debateLedger: DebateLedger | undefined = debateModerator.buildLedger(
      debateTranscript,
      businessAnalysis,
      riskAssessment,
      humanReview.finalRecommendation,
      debating
    );

    // ── Decision Delta (baseline vs multi-agent) ──────────────────────────────
    const baselineResult = await baselinePromise;
    let decisionDelta: DecisionDelta | undefined;
    if (baselineResult) {
      const multiDecision = humanReview.finalRecommendation;
      const baseDecision = baselineResult.decision;
      let deltaType: DecisionDelta["deltaType"];
      if (multiDecision === baseDecision) {
        deltaType = "same_decision";
      } else if (
        (baseDecision === "approved" && multiDecision !== "approved") ||
        (baseDecision === "requires-clarification" && multiDecision === "rejected")
      ) {
        deltaType = "multi_more_conservative";
      } else {
        deltaType = "multi_more_permissive";
      }

      const valueAdded: string[] = [
        `CBN compliance check via MCP (${riskAssessment.riskFactors.length} structured risk factors)`,
        `Sector benchmark lookup via MCP (GTV vs industry average)`,
        `Portfolio default rate via MCP (${snapshot.businessType} sector)`,
        `Formal debate round: ${debating ? "fired — " + (debateLedger?.totalClaims ?? 0) + " claims negotiated" : "skipped — agents aligned"}`,
        `Murabaha policy engine: sale price ₦${humanReview.approvalAmount || "N/A"} from GTV`,
        `DebateLedger: ${debateLedger?.totalClaims ?? 0} structured claims with typed resolutions`,
        `RunObservability: request ID, per-agent timing, Qwen + MCP call counts`,
      ];

      const reason =
        deltaType === "same_decision"
          ? `Both approaches reached '${multiDecision}'. Multi-agent advantage is decision quality: structured risk factors, Murabaha terms, disbursement conditions, and an auditable debate transcript — not available from baseline.`
          : deltaType === "multi_more_conservative"
          ? `Multi-agent system was more conservative: baseline said '${baseDecision}', debate surfaced concerns that pushed outcome to '${multiDecision}'. In underwriting, a false approval is more costly than a delayed one.`
          : `Multi-agent debate overcame an initially cautious baseline ('${baseDecision}') by surfacing contextual evidence that de-risked the application.`;

      decisionDelta = {
        baselineDecision: baseDecision,
        multiAgentDecision: multiDecision,
        deltaType,
        decisionChanged: multiDecision !== baseDecision,
        reason,
        valueAdded,
        structuredOutputAdvantage:
          "Baseline: decision + prose reasoning. Multi-agent: DataQualityResult, BusinessAnalysisResult, RiskAssessmentResult (with riskFactors[]), FinancingStructureResult (Murabaha terms), HumanReviewResult, DebateTranscript, DebateLedger (typed claims), DebateResolution, RunObservability — all structured, all auditable.",
        baselineExecutionTime: baselineResult.executionTime,
        multiAgentExecutionTime: executionTime,
      };
    }

    const observability: RunObservability = {
      requestId,
      mockMode: qwenClient.mockMode,
      model: process.env.QWEN_MODEL || "qwen-max",
      totalQwenCalls: qwenClient.getCallCount(),
      totalMcpCalls: agentTimings.reduce((s, t) => s + t.mcpCallCount, 0),
      agentTimings,
      parallelStages: ["Data Quality Agent", "Business Analysis Agent"],
      debateRoundFired: debating,
      stage4Skipped: likelyRejection,
    };

    console.log(`\n📊 Observability: ${observability.totalQwenCalls} Qwen calls · ${observability.totalMcpCalls} MCP calls · ${agentTimings.length} stages · requestId=${requestId}`);

    return {
      merchantId: snapshot.id,
      executionTime,
      dataQuality,
      businessAnalysis,
      riskAssessment,
      financingStructure,
      humanReview,
      debateTranscript,
      debateResolution,
      debateLedger,
      decisionDelta,
      observability,
    };
  }
}
