/**
 * Persistence tests for local decision storage.
 * No OTS_* env vars are set here, so merchants come from temp local snapshot
 * files while decisions are preserved in a temp local JSON file.
 */
import fs from "fs";
import path from "path";

// Force local decision storage BEFORE importing the module.
const TMP_DECISIONS = path.join(process.cwd(), "data", "decisions.test.json");
const TMP_MERCHANTS = path.join(process.cwd(), "data", "snapshots.test");
process.env.LOCAL_DECISIONS_FILE = TMP_DECISIONS;
process.env.LOCAL_MERCHANTS_DIR = TMP_MERCHANTS;
delete process.env.OTS_ENDPOINT;
delete process.env.OTS_INSTANCE;
delete process.env.OTS_ACCESS_KEY_ID;
delete process.env.OTS_ACCESS_KEY_SECRET;

import {
  tablestoreConfigured,
  decisionStoreMode,
  listMerchants,
  getMerchantSnapshot,
  saveMerchantSnapshot,
  saveUnderwritingDecision,
  getDecisionsForMerchant,
  getMerchantDecisionSummaries,
  getDecisionById,
  listDecisionsByType,
} from "../utils/tablestore";
import { UnderwritingReport } from "../utils/types";

function fakeReport(merchantId: string, requestId: string, decision: "approved" | "rejected"): UnderwritingReport {
  return {
    merchantId,
    executionTime: "1.2s",
    humanReview: { finalRecommendation: decision, approvalAmount: "₦100,000", approvedAmountNaira: 100000 },
    observability: { requestId, mockMode: false, model: "qwen-max", totalQwenCalls: 5, totalMcpCalls: 2, agentTimings: [] },
  } as unknown as UnderwritingReport;
}

beforeEach(() => {
  if (fs.existsSync(TMP_DECISIONS)) fs.unlinkSync(TMP_DECISIONS);
  fs.rmSync(TMP_MERCHANTS, { recursive: true, force: true });
  fs.mkdirSync(TMP_MERCHANTS, { recursive: true });
  fs.writeFileSync(
    path.join(TMP_MERCHANTS, "M1.json"),
    JSON.stringify({
      id: "M1",
      businessName: "Test Merchant",
      businessType: "School",
      ageInDays: 90,
      orders: { total: 10, completed: 8, cancelled: 0, outstanding: 2 },
      receivables: { outstandingOrders: 2, totalOwedNaira: 1000, totalCollectedNaira: 800, uncollectedNaira: 200 },
      monthlyRevenue: [{ month: "2026-06", revenueNaira: 1000, orderCount: 10, uniqueCustomers: 8 }],
      signals: {
        period30d: { activeDays: 5, totalOrders: 10, avgDailyRevenueNaira: 30, editRate: 0, deleteRate: 0, backdateRate: 0, batchDays: 0 },
        period90d: { activeDays: 15, totalOrders: 20, avgDailyRevenueNaira: 30 },
      },
    }),
    "utf-8"
  );
});
afterAll(() => {
  if (fs.existsSync(TMP_DECISIONS)) fs.unlinkSync(TMP_DECISIONS);
  fs.rmSync(TMP_MERCHANTS, { recursive: true, force: true });
});

describe("local decision persistence", () => {
  test("uses local snapshot merchants and local decision storage without OTS credentials", () => {
    expect(tablestoreConfigured).toBe(false);
    expect(decisionStoreMode).toBe("local-json");
  });

  test("lists merchants from local snapshot files", async () => {
    const merchants = await listMerchants();
    expect(merchants.map((m) => m.id)).toEqual(["M1"]);
  });

  test("loads and saves merchant snapshot files", async () => {
    const one = await getMerchantSnapshot("M1");
    expect(one?.id).toBe("M1");
    await saveMerchantSnapshot({ ...one!, id: "M2", businessName: "Second Merchant" });
    expect((await getMerchantSnapshot("M2"))?.businessName).toBe("Second Merchant");
    expect(await getMerchantSnapshot("does-not-exist")).toBeNull();
  });

  test("persists and reads back decisions (newest first)", async () => {
    await saveUnderwritingDecision(fakeReport("M1", "2026-06-27T00-00-00Z-aaa", "approved"));
    await saveUnderwritingDecision(fakeReport("M1", "2026-06-27T01-00-00Z-bbb", "rejected"));

    const reports = await getDecisionsForMerchant("M1");
    expect(reports.length).toBe(2);
    expect(reports[0].observability.requestId).toBe("2026-06-27T01-00-00Z-bbb"); // newest first

    const summaries = await getMerchantDecisionSummaries("M1");
    expect(summaries.length).toBe(2);
    expect(summaries[0]).not.toHaveProperty("report");
    expect(summaries[0].decision).toBe("rejected");

    const single = await getDecisionById("M1", "2026-06-27T00-00-00Z-aaa");
    expect(single?.report.humanReview.finalRecommendation).toBe("approved");
    expect(await getDecisionById("M1", "nope")).toBeNull();
  });

  test("lists decisions by type across merchants", async () => {
    await saveUnderwritingDecision(fakeReport("M1", "2026-06-27T00-00-00Z-aaa", "approved"));
    await saveUnderwritingDecision(fakeReport("M2", "2026-06-27T02-00-00Z-ccc", "approved"));
    await saveUnderwritingDecision(fakeReport("M3", "2026-06-27T03-00-00Z-ddd", "rejected"));

    const approved = await listDecisionsByType("approved");
    expect(approved.map((d) => d.merchantId).sort()).toEqual(["M1", "M2"]);
    const rejected = await listDecisionsByType("rejected");
    expect(rejected.map((d) => d.merchantId)).toEqual(["M3"]);
  });
});
