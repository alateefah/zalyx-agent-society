import * as fs from "fs";
import * as path from "path";
import { MerchantData } from "../utils/types";
import { AgentOrchestrator } from "../orchestration/agent-orchestrator";

// Generate synthetic merchant data for demo
function generateSyntheticMerchant(
  id: string,
  businessName: string,
  type: string,
  healthProfile: "strong" | "moderate" | "weak"
): MerchantData {
  const registrationDate = new Date();
  registrationDate.setMonth(registrationDate.getMonth() - 8); // 8 months old

  const transactions = [];

  // Generate 30 transactions over 8 months
  for (let i = 0; i < 30; i++) {
    const date = new Date(registrationDate);
    date.setDate(date.getDate() + Math.floor(Math.random() * 240));

    let incomeAmount = 5000;
    let expenseAmount = 3000;

    if (healthProfile === "strong") {
      incomeAmount = 6000 + Math.random() * 4000;
      expenseAmount = 3000 + Math.random() * 1500;
    } else if (healthProfile === "moderate") {
      incomeAmount = 4000 + Math.random() * 3000;
      expenseAmount = 2500 + Math.random() * 2000;
    } else {
      incomeAmount = 2000 + Math.random() * 2000;
      expenseAmount = 2000 + Math.random() * 2500;
    }

    if (Math.random() > 0.5) {
      transactions.push({
        date: date.toISOString(),
        amount: incomeAmount,
        type: "income" as const,
        description: `Sale - ${businessName}`,
      });
    } else {
      transactions.push({
        date: date.toISOString(),
        amount: expenseAmount,
        type: "expense" as const,
        description: `Operating expense - ${businessName}`,
      });
    }
  }

  return {
    id,
    businessName,
    businessType: type,
    registrationDate: registrationDate.toISOString(),
    transactions: transactions.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    ),
  };
}

// Format report for display
function formatReport(report: any): string {
  const sections = [];

  sections.push("═".repeat(60));
  sections.push("UNDERWRITING REPORT");
  sections.push("═".repeat(60));

  sections.push(
    `\nMerchant ID: ${report.merchantId}\nExecution Time: ${report.executionTime}\n`
  );

  // Data Quality
  sections.push("DATA QUALITY ASSESSMENT");
  sections.push("-".repeat(40));
  sections.push(
    `Completeness: ${report.dataQuality.completeness.toFixed(1)}%`
  );
  sections.push(
    `Consistency: ${report.dataQuality.consistency.toFixed(1)}%`
  );
  sections.push(`Overall Score: ${report.dataQuality.overallScore.toFixed(1)}/100`);
  if (report.dataQuality.anomalies.length > 0) {
    sections.push(`Anomalies: ${report.dataQuality.anomalies.join(", ")}`);
  }

  // Business Analysis
  sections.push("\nBUSINESS ANALYSIS");
  sections.push("-".repeat(40));
  sections.push(
    `Monthly Revenue Avg: ${report.businessAnalysis.monthlyRevenueAverage.toFixed(2)}`
  );
  sections.push(
    `Revenue Stability: ${report.businessAnalysis.revenueStability.toFixed(1)}/100`
  );
  sections.push(
    `Business Health Score: ${report.businessAnalysis.businessHealthScore.toFixed(1)}/100`
  );
  sections.push(`Recommendation: ${report.businessAnalysis.recommendation}`);

  // Risk Assessment
  sections.push("\nRISK ASSESSMENT");
  sections.push("-".repeat(40));
  sections.push(
    `Volatility Index: ${report.riskAssessment.volatilityIndex.toFixed(1)}/100`
  );
  sections.push(
    `Concentration Risk: ${report.riskAssessment.concentrationRisk}`
  );
  sections.push(`Risk Score: ${report.riskAssessment.overallRiskScore.toFixed(1)}/100`);
  sections.push(`Recommendation: ${report.riskAssessment.recommendation}`);

  // Financing Structure
  sections.push("\nFINANCING STRUCTURE");
  sections.push("-".repeat(40));
  sections.push(`Proposed Amount: ${report.financingStructure.proposedAmount}`);
  sections.push(`Terms: ${report.financingStructure.repaymentTerms}`);
  sections.push(`Payment Schedule: ${report.financingStructure.paymentSchedule}`);
  sections.push(
    `Risk Mitigations: ${report.financingStructure.riskMitigation.join("; ")}`
  );

  // Human Review (Final Decision)
  sections.push("\nFINAL DECISION");
  sections.push("═".repeat(60));
  sections.push(
    `Recommendation: ${report.humanReview.finalRecommendation.toUpperCase()}`
  );
  sections.push(`Approved Amount: ${report.humanReview.approvalAmount}`);
  sections.push(`Terms Adjustments: ${report.humanReview.termsAdjustments}`);

  // Debate Transcript
  sections.push("\nAGENT DEBATE TRANSCRIPT");
  sections.push("-".repeat(40));
  report.debateTranscript.forEach((msg: any, idx: number) => {
    sections.push(`\n[${idx + 1}] ${msg.agentName} (${msg.agentRole})`);
    sections.push(`    Time: ${msg.timestamp}`);
    if (msg.confidence)
      sections.push(`    Confidence: ${msg.confidence.toFixed(0)}/100`);
    sections.push(`    Message: ${msg.message.substring(0, 200)}...`);
  });

  sections.push("\n" + "═".repeat(60));

  return sections.join("\n");
}

async function main() {
  console.log("🚀 Zalyx Agent Society Demo");
  console.log("═".repeat(60));
  console.log(
    "Building multi-agent merchant underwriting system...\n"
  );

  // Initialize orchestrator
  const orchestrator = new AgentOrchestrator();

  // Create synthetic merchants
  const merchants = [
    generateSyntheticMerchant(
      "demo-001",
      "Urban Retail Store",
      "retail",
      "strong"
    ),
    generateSyntheticMerchant(
      "demo-002",
      "Food Vendor Business",
      "food",
      "moderate"
    ),
    generateSyntheticMerchant(
      "demo-003",
      "Service Provider",
      "services",
      "weak"
    ),
  ];

  // Run underwriting for first merchant as demo
  const testMerchant = merchants[0];

  console.log(`\nProcessing: ${testMerchant.businessName}`);
  console.log(`Type: ${testMerchant.businessType}`);
  console.log(`Transactions: ${testMerchant.transactions.length}`);

  try {
    const report = await orchestrator.runUnderwriting(testMerchant);

    // Display formatted report
    const formattedReport = formatReport(report);
    console.log(formattedReport);

    // Save to file
    const outputPath = path.join(
      __dirname,
      "../data",
      `underwriting-report-${testMerchant.id}.json`
    );
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Full report saved to: ${outputPath}`);

    // Save merchant data for reference
    const merchantPath = path.join(
      __dirname,
      "../data/sample-merchants",
      `${testMerchant.id}.json`
    );
    const merchantDir = path.dirname(merchantPath);
    if (!fs.existsSync(merchantDir)) {
      fs.mkdirSync(merchantDir, { recursive: true });
    }

    fs.writeFileSync(merchantPath, JSON.stringify(testMerchant, null, 2));
    console.log(`📁 Merchant data saved to: ${merchantPath}`);
  } catch (error) {
    console.error("❌ Underwriting failed:", error);
    process.exit(1);
  }
}

main();
