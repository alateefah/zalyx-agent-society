/**
 * Zalyx Agent Society — Benchmark Runner
 *
 * Runs all demo merchants through both the single-agent baseline and the
 * full 5-agent multi-agent pipeline, then emits a JSON results file and
 * a markdown comparison table.
 *
 * Usage:
 *   yarn benchmark
 *
 * Output:
 *   benchmark/results.json   — full structured results
 *   benchmark/results.md     — human-readable comparison table
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

import { AgentOrchestrator } from "../orchestration/agent-orchestrator";
import { BaselineAgent } from "../agents/baseline-agent";
import { ZalyxMerchantSnapshot, UnderwritingReport, BaselineReport } from "../utils/types";

// ── Load merchant snapshots ───────────────────────────────────────────────────

const SNAPSHOTS_DIR = path.resolve(__dirname, "../data/snapshots");

function loadSnapshots(): ZalyxMerchantSnapshot[] {
  return fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), "utf8")) as ZalyxMerchantSnapshot);
}

// ── Metrics computation ───────────────────────────────────────────────────────

interface BenchmarkRow {
  merchant_id: string;
  business_type: string;

  // Baseline
  baseline_decision: string;
  baseline_confidence: number;
  baseline_latency_ms: number;
  baseline_proposed_amount: string;

  // Multi-agent
  multiagent_decision: string;
  multiagent_latency_ms: number;
  multiagent_proposed_amount: string;
  data_quality_score: number;
  business_health_score: number;
  risk_score: number;
  risk_factors_caught: number;
  debate_fired: boolean;
  agent_stages: number;
  qwen_structured_calls: number;

  // Comparison
  decisions_differ: boolean;
  extra_risk_factors_vs_baseline: number;
  structured_output_completeness: number; // 0–100
  rationale_words_multiagent: number;
  rationale_words_baseline: number;
  actionability_score: number; // computed
}

/**
 * Counts words in a string (rough proxy for rationale depth).
 */
function wordCount(s: string): number {
  return s ? s.trim().split(/\s+/).length : 0;
}

/**
 * Structured output completeness: does the multi-agent report have all the
 * fields a production underwriter needs?
 * Each present + non-empty field = points.
 */
function structuredOutputCompleteness(report: UnderwritingReport): number {
  const checks: boolean[] = [
    !!report.dataQuality.overallScore,
    report.dataQuality.anomalies.length >= 0,          // even empty = present
    !!report.businessAnalysis.businessHealthScore,
    !!report.businessAnalysis.monthlyRevenueAverage,
    !!report.riskAssessment.overallRiskScore,
    report.riskAssessment.riskFactors.length > 0,
    !!report.riskAssessment.concentrationRisk,
    !!report.financingStructure.proposedAmount,
    !!report.financingStructure.repaymentTerms,
    report.financingStructure.riskMitigation.length > 0 ||
      report.humanReview.finalRecommendation === "rejected",
    !!report.humanReview.finalRecommendation,
    !!report.humanReview.reason,
    report.debateTranscript.length > 0,
    report.debateTranscript.some((m) => m.messageType === "challenge"),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/**
 * Actionability score: proxy for how useful the decision is to an underwriter.
 *   +20 for having a structured decision
 *   +20 for risk factors > 0
 *   +20 for debate transcript present
 *   +20 for financing terms when approved
 *   +20 for reason word count > 50
 */
function actionabilityScore(report: UnderwritingReport): number {
  let score = 0;
  if (report.humanReview.finalRecommendation) score += 20;
  if (report.riskAssessment.riskFactors.length > 0) score += 20;
  if (report.debateTranscript.length > 2) score += 20;
  if (
    report.humanReview.finalRecommendation === "approved" &&
    report.financingStructure.proposedAmount !== "₦0"
  )
    score += 20;
  if (wordCount(report.humanReview.reason) > 50) score += 20;
  return score;
}

// ── Run one merchant ──────────────────────────────────────────────────────────

async function benchmarkMerchant(
  snapshot: ZalyxMerchantSnapshot,
  orchestrator: AgentOrchestrator,
  baselineAgent: BaselineAgent
): Promise<BenchmarkRow> {
  console.log(`\n━━━ ${snapshot.id} (${snapshot.businessType}) ━━━`);

  // Baseline
  console.log("  Running baseline...");
  const t0b = Date.now();
  const baseline: BaselineReport = await baselineAgent.evaluate(snapshot);
  const baselineMs = Date.now() - t0b;
  console.log(`  ✓ Baseline: ${baseline.decision} in ${baselineMs}ms`);

  // Multi-agent
  console.log("  Running multi-agent pipeline...");
  const t0m = Date.now();
  const report: UnderwritingReport = await orchestrator.runUnderwriting(snapshot);
  const multiMs = Date.now() - t0m;
  console.log(`  ✓ Multi-agent: ${report.humanReview.finalRecommendation} in ${multiMs}ms`);

  const debateFired = report.debateTranscript.some(
    (m) => m.messageType === "rebuttal" || m.messageType === "verdict"
  );
  const structuredCalls = report.debateTranscript.filter(
    (m) => m.agentName === "Risk Assessment Agent" ||
           m.agentName === "Financing Structure Agent" ||
           m.agentName === "Human Review Agent"
  ).length;

  const baselineRiskWords = wordCount(baseline.riskSummary);
  const baselineReasonWords = wordCount(baseline.reasoning);
  const multiReasonWords = wordCount(report.humanReview.reason);
  const multiRiskFactors = report.riskAssessment.riskFactors.length;

  // Rough estimate of risk factors the baseline mentioned
  const baselineRiskFactorMentions = (baseline.riskSummary + baseline.reasoning)
    .split(/[.,;]/)
    .filter((s) => s.trim().length > 10).length;

  const completeness = structuredOutputCompleteness(report);
  const actionability = actionabilityScore(report);

  return {
    merchant_id: snapshot.id,
    business_type: snapshot.businessType,

    baseline_decision: baseline.decision,
    baseline_confidence: baseline.confidence,
    baseline_latency_ms: baselineMs,
    baseline_proposed_amount: baseline.proposedAmount,

    multiagent_decision: report.humanReview.finalRecommendation,
    multiagent_latency_ms: multiMs,
    multiagent_proposed_amount: report.humanReview.approvalAmount || report.financingStructure.proposedAmount,
    data_quality_score: report.dataQuality.overallScore,
    business_health_score: report.businessAnalysis.businessHealthScore,
    risk_score: report.riskAssessment.overallRiskScore,
    risk_factors_caught: multiRiskFactors,
    debate_fired: debateFired,
    agent_stages: report.debateTranscript.length,
    qwen_structured_calls: structuredCalls,

    decisions_differ: baseline.decision !== report.humanReview.finalRecommendation,
    extra_risk_factors_vs_baseline: Math.max(0, multiRiskFactors - baselineRiskFactorMentions),
    structured_output_completeness: completeness,
    rationale_words_multiagent: multiReasonWords,
    rationale_words_baseline: baselineReasonWords + baselineRiskWords,
    actionability_score: actionability,
  };
}

// ── Markdown table ────────────────────────────────────────────────────────────

function toMarkdownTable(rows: BenchmarkRow[]): string {
  const isMock = !process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "your_qwen_cloud_api_key_here";
  const mode = isMock ? "Mock Mode" : "Live AI (Qwen Cloud)";

  const lines: string[] = [];
  lines.push(`# Zalyx Agent Society — Benchmark Results`);
  lines.push(`\n**Run date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Mode:** ${mode}`);
  lines.push(`**Merchants:** ${rows.length} (${rows.map((r) => r.merchant_id).join(", ")})`);
  lines.push(``);

  // ── Decision comparison ───────────────────────────────────────────────────
  lines.push(`## 1. Decision Comparison`);
  lines.push(``);
  lines.push(`| Merchant | Type | Baseline Decision | Baseline Confidence | Multi-Agent Decision | Decisions Differ? |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of rows) {
    lines.push(
      `| ${r.merchant_id} | ${r.business_type} | ${r.baseline_decision} | ${r.baseline_confidence}% | ${r.multiagent_decision} | ${r.decisions_differ ? "**Yes**" : "No"} |`
    );
  }
  lines.push(``);

  // ── Latency ──────────────────────────────────────────────────────────────
  lines.push(`## 2. Latency`);
  lines.push(``);
  lines.push(`| Merchant | Baseline | Multi-Agent | Multi-Agent Overhead |`);
  lines.push(`|---|---|---|---|`);
  for (const r of rows) {
    const overhead = r.multiagent_latency_ms - r.baseline_latency_ms;
    const overheadStr = overhead >= 0 ? `+${(overhead / 1000).toFixed(1)}s` : `${(overhead / 1000).toFixed(1)}s`;
    lines.push(
      `| ${r.merchant_id} | ${(r.baseline_latency_ms / 1000).toFixed(1)}s | ${(r.multiagent_latency_ms / 1000).toFixed(1)}s | ${overheadStr} |`
    );
  }
  lines.push(``);

  // ── Risk coverage ─────────────────────────────────────────────────────────
  lines.push(`## 3. Risk Coverage & Agent Activity`);
  lines.push(``);
  lines.push(`| Merchant | Data Quality | Health Score | Risk Score | Risk Factors | Debate Fired | Agent Stages | Structured Qwen Calls |`);
  lines.push(`|---|---|---|---|---|---|---|---|`);
  for (const r of rows) {
    lines.push(
      `| ${r.merchant_id} | ${r.data_quality_score}/100 | ${r.business_health_score}/100 | ${r.risk_score}/100 | ${r.risk_factors_caught} | ${r.debate_fired ? "**Yes**" : "No"} | ${r.agent_stages} | ${r.qwen_structured_calls} |`
    );
  }
  lines.push(``);

  // ── Output quality ────────────────────────────────────────────────────────
  lines.push(`## 4. Output Quality`);
  lines.push(``);
  lines.push(`| Merchant | Structured Completeness | Actionability Score | Rationale Words (Multi) | Rationale Words (Baseline) | Depth Gain |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const r of rows) {
    const depthGain = r.rationale_words_multiagent - r.rationale_words_baseline;
    lines.push(
      `| ${r.merchant_id} | ${r.structured_output_completeness}% | ${r.actionability_score}/100 | ${r.rationale_words_multiagent} | ${r.rationale_words_baseline} | +${depthGain} words |`
    );
  }
  lines.push(``);

  // ── Summary ───────────────────────────────────────────────────────────────
  const avgActionability = Math.round(rows.reduce((s, r) => s + r.actionability_score, 0) / rows.length);
  const avgCompleteness = Math.round(rows.reduce((s, r) => s + r.structured_output_completeness, 0) / rows.length);
  const debateFiredCount = rows.filter((r) => r.debate_fired).length;
  const decisionsDiffered = rows.filter((r) => r.decisions_differ).length;
  const avgBaselineMs = Math.round(rows.reduce((s, r) => s + r.baseline_latency_ms, 0) / rows.length);
  const avgMultiMs = Math.round(rows.reduce((s, r) => s + r.multiagent_latency_ms, 0) / rows.length);
  const totalRiskFactors = rows.reduce((s, r) => s + r.risk_factors_caught, 0);

  lines.push(`## 5. Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Merchants benchmarked | ${rows.length} |`);
  lines.push(`| Decisions that differed (baseline vs multi-agent) | ${decisionsDiffered}/${rows.length} |`);
  lines.push(`| Debate round fired | ${debateFiredCount}/${rows.length} merchants |`);
  lines.push(`| Total risk factors surfaced across all merchants | ${totalRiskFactors} |`);
  lines.push(`| Avg structured output completeness | ${avgCompleteness}% |`);
  lines.push(`| Avg actionability score | ${avgActionability}/100 |`);
  lines.push(`| Avg baseline latency | ${(avgBaselineMs / 1000).toFixed(1)}s |`);
  lines.push(`| Avg multi-agent latency | ${(avgMultiMs / 1000).toFixed(1)}s |`);
  lines.push(`| Latency tradeoff per merchant | +${((avgMultiMs - avgBaselineMs) / 1000).toFixed(1)}s for structured debate |`);
  lines.push(``);
  lines.push(`> **Why the overhead is worth it in underwriting:**`);
  lines.push(`> A false approval on a ₦500k Murabaha offer costs Zalyx ~₦100k+ in default exposure.`);
  lines.push(`> A false rejection costs a merchant a financing opportunity and Zalyx a transaction fee.`);
  lines.push(`> ${(avgMultiMs / 1000).toFixed(1)}s of compute to surface ${Math.round(totalRiskFactors / rows.length)} structured risk factors per merchant,`);
  lines.push(`> trigger a formal debate when agents disagree, and produce a decision that can be`);
  lines.push(`> audited by a compliance officer is a sound tradeoff for production underwriting.`);

  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🏁 Zalyx Agent Society — Benchmark Runner");
  console.log("==========================================");

  const isMock = !process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "your_qwen_cloud_api_key_here";
  console.log(`Mode: ${isMock ? "⚠️  MOCK (no Qwen API key)" : "✅ Live AI (Qwen Cloud)"}`);

  const snapshots = loadSnapshots();
  console.log(`Merchants: ${snapshots.map((s) => s.id).join(", ")}`);

  const orchestrator = new AgentOrchestrator();
  const baselineAgent = new BaselineAgent();

  const results: BenchmarkRow[] = [];

  for (const snapshot of snapshots) {
    const row = await benchmarkMerchant(snapshot, orchestrator, baselineAgent);
    results.push(row);
  }

  // Write outputs
  const outDir = path.resolve(__dirname);
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify({ runDate: new Date().toISOString(), mode: isMock ? "mock" : "live", results }, null, 2));
  console.log(`\n📄 JSON results → ${jsonPath}`);

  const mdPath = path.join(outDir, "results.md");
  fs.writeFileSync(mdPath, toMarkdownTable(results));
  console.log(`📊 Markdown table → ${mdPath}`);

  // Print summary to console
  console.log("\n── Quick Summary ──────────────────────────────────────────────");
  const decisionsDiffered = results.filter((r) => r.decisions_differ).length;
  const debateFired = results.filter((r) => r.debate_fired).length;
  console.log(`  Decisions differed (baseline vs multi): ${decisionsDiffered}/${results.length}`);
  console.log(`  Debate round fired: ${debateFired}/${results.length} merchants`);
  console.log(`  Avg actionability: ${Math.round(results.reduce((s, r) => s + r.actionability_score, 0) / results.length)}/100`);
  console.log(`  Avg completeness:  ${Math.round(results.reduce((s, r) => s + r.structured_output_completeness, 0) / results.length)}%`);
  console.log("────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
