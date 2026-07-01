/**
 * Seed demo underwriting decisions for every merchant in data/snapshots.
 * Runs in whatever mode utils/tablestore is in: real Tablestore when OTS_*
 * credentials are set, else the local JSON store (data/decisions.local.json).
 *
 *   yarn seed
 */
import dotenv from "dotenv";
dotenv.config();

import { randomUUID } from "crypto";
import { listMerchants, saveUnderwritingDecision, initTablestore } from "./tablestore";
import { UnderwritingReport } from "./types";

function isoRequestId(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
}

function demoReport(
  merchantId: string,
  decision: "approved" | "rejected",
  daysAgo: number
): UnderwritingReport {
  const approved = decision === "approved" ? 250000 : 0;
  return {
    merchantId,
    executionTime: "2.4s",
    humanReview: {
      finalRecommendation: decision,
      approvalAmount: decision === "approved" ? "₦250,000" : "—",
      approvedAmountNaira: approved,
    },
    observability: {
      requestId: isoRequestId(daysAgo),
      mockMode: true,
      model: process.env.QWEN_MODEL || "qwen-max",
      totalQwenCalls: 5,
      totalMcpCalls: 2,
      agentTimings: [],
    },
  } as unknown as UnderwritingReport;
}

async function main() {
  await initTablestore();
  const merchants = await listMerchants();
  if (merchants.length === 0) {
    console.log("No merchants found in data/snapshots — nothing to seed.");
    return;
  }
  let n = 0;
  for (const [i, m] of merchants.entries()) {
    // Two historical decisions per merchant: one approved, one rejected.
    await saveUnderwritingDecision(demoReport(m.id, "approved", 7 + i));
    await saveUnderwritingDecision(demoReport(m.id, "rejected", 3 + i));
    n += 2;
  }
  console.log(`✅ Seeded ${n} demo decisions across ${merchants.length} merchants.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
