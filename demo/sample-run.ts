import * as fs from "fs";
import * as path from "path";
import { ZalyxMerchantSnapshot } from "../utils/types";
import { AgentOrchestrator } from "../orchestration/agent-orchestrator";

function loadSnapshot(filename: string): ZalyxMerchantSnapshot {
  const filePath = path.join(__dirname, "../data/snapshots", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function formatReport(report: any): string {
  const L = "═".repeat(60);
  const l = "─".repeat(40);
  const lines: string[] = [];

  lines.push(L, "UNDERWRITING REPORT", L);
  lines.push(`\nMerchant:       ${report.merchantId}`);
  lines.push(`Execution Time: ${report.executionTime}\n`);

  lines.push("DATA QUALITY", l);
  lines.push(`  Score:        ${report.dataQuality.overallScore}/100`);
  lines.push(`  Completeness: ${report.dataQuality.completeness}/100`);
  lines.push(`  Consistency:  ${report.dataQuality.consistency}/100`);
  if (report.dataQuality.anomalies.length > 0) {
    lines.push(`  Anomalies:    ${report.dataQuality.anomalies.join(" | ")}`);
  }

  lines.push("\nBUSINESS ANALYSIS", l);
  lines.push(`  Health Score: ${report.businessAnalysis.businessHealthScore}/100`);
  lines.push(`  Avg Revenue:  ₦${report.businessAnalysis.monthlyRevenueAverage.toLocaleString()}/month`);
  lines.push(`  Profitability: ${report.businessAnalysis.profitabilityIndicator}`);
  lines.push(`  View:         ${report.businessAnalysis.recommendation}`);

  lines.push("\nRISK ASSESSMENT", l);
  lines.push(`  Risk Score:   ${report.riskAssessment.overallRiskScore}/100`);
  lines.push(`  Concentration: ${report.riskAssessment.concentrationRisk}`);
  lines.push(`  View:         ${report.riskAssessment.recommendation}`);
  if (report.riskAssessment.riskFactors.length > 0) {
    lines.push(`  Flags:        ${report.riskAssessment.riskFactors.join(" | ")}`);
  }

  lines.push("\nFINANCING STRUCTURE", l);
  lines.push(`  Amount:   ${report.financingStructure.proposedAmount}`);
  lines.push(`  Terms:    ${report.financingStructure.repaymentTerms}`);
  lines.push(`  Schedule: ${report.financingStructure.paymentSchedule}`);
  lines.push(`  Mitigations: ${report.financingStructure.riskMitigation.join(" | ")}`);

  lines.push(`\n${L}`);
  lines.push(`FINAL DECISION: ${report.humanReview.finalRecommendation.toUpperCase()}`);
  lines.push(`Amount:  ${report.humanReview.approvalAmount}`);
  lines.push(`Notes:   ${report.humanReview.agentDebateNotes}`);
  lines.push(L);

  lines.push("\nAGENT DEBATE TRANSCRIPT");
  report.debateTranscript.forEach((msg: any, i: number) => {
    lines.push(`\n[${i + 1}] ${msg.agentName}`);
    if (msg.confidence !== undefined) lines.push(`    Confidence: ${msg.confidence.toFixed ? msg.confidence.toFixed(0) : msg.confidence}/100`);
    lines.push(`    ${msg.message.substring(0, 300)}...`);
  });

  return lines.join("\n");
}

async function main() {
  console.log("🚀 Zalyx Agent Society — Real Merchant Demo");
  console.log("═".repeat(60));

  const orchestrator = new AgentOrchestrator();

  // Pick snapshot: ZALYX-001 (School), ZALYX-002 (Glow Naturals), ZALYX-003 (Apex Creative)
  const snapshotFile = process.argv[2] || "ZALYX-001.json";
  const snapshot = loadSnapshot(snapshotFile);

  console.log(`\nMerchant:      ${snapshot.businessName}`);
  console.log(`Type:          ${snapshot.businessType}`);
  console.log(`Age:           ${snapshot.ageInDays} days`);
  console.log(`Revenue data:  ${snapshot.monthlyRevenue.length} months`);
  console.log(`Active days:   ${snapshot.signals.period30d.activeDays}/30 (last 30d)`);

  const report = await orchestrator.runUnderwriting(snapshot);

  console.log("\n" + formatReport(report));

  const outDir = path.join(__dirname, "../data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `report-${snapshot.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n📁 Full report saved: ${outPath}`);
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
