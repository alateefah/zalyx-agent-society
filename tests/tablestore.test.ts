/**
 * Tablestore persistence — mock-mode unit tests.
 * No OTS_* env vars are set here, so the module runs against
 * data/snapshots/*.json (merchants) and a temp decisions JSON file.
 */
import fs from "fs";
import path from "path";

// Force mock mode + isolate the local decisions file BEFORE importing the module.
const TMP_DECISIONS = path.join(process.cwd(), "data", "decisions.test.json");
process.env.OTS_DECISIONS_FILE = TMP_DECISIONS;
delete process.env.OTS_ENDPOINT;
delete process.env.OTS_INSTANCE;
delete process.env.OTS_ACCESS_KEY_ID;
delete process.env.OTS_ACCESS_KEY_SECRET;

import {
  tablestoreMockMode,
  listMerchants,
  getMerchantSnapshot,
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
    observability: { requestId, mockMode: true, model: "qwen-max", totalQwenCalls: 5, totalMcpCalls: 2, agentTimings: [] },
  } as unknown as UnderwritingReport;
}

beforeEach(() => {
  if (fs.existsSync(TMP_DECISIONS)) fs.unlinkSync(TMP_DECISIONS);
});
afterAll(() => {
  if (fs.existsSync(TMP_DECISIONS)) fs.unlinkSync(TMP_DECISIONS);
});

describe("tablestore mock mode", () => {
  test("runs in mock mode without OTS credentials", () => {
    expect(tablestoreMockMode).toBe(true);
  });

  test("lists merchants from data/snapshots", async () => {
    const merchants = await listMerchants();
    expect(merchants.length).toBeGreaterThan(0);
    expect(merchants[0]).toHaveProperty("id");
  });

  test("loads a single merchant by id", async () => {
    const all = await listMerchants();
    const one = await getMerchantSnapshot(all[0].id);
    expect(one?.id).toBe(all[0].id);
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
