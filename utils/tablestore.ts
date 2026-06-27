/**
 * Alibaba Cloud Tablestore (OTS) persistence — Zalyx Underwriting.
 *
 * Two tables:
 *   zalyx_merchants  — merchant snapshots (PK: id)
 *   zalyx_decisions  — underwriting reports (PK: merchantId + requestId)
 *                      global secondary index `decision_index` on (decision, createdAt)
 *                      → "all approvals / rejections across merchants"
 *
 * Mock-first: with no OTS_* credentials, merchants are read from
 * data/snapshots/*.json and decisions from a local JSON file, so the full
 * demo runs with zero Alibaba Cloud access. Real Tablestore activates
 * automatically when OTS_ENDPOINT/OTS_INSTANCE/OTS_ACCESS_KEY_ID/OTS_ACCESS_KEY_SECRET are set.
 */
import fs from "fs";
import path from "path";
import { ZalyxMerchantSnapshot, UnderwritingReport } from "./types";
import {
  StoredDecision,
  readLocalDecisions,
  appendLocalDecision,
} from "./tablestore-mock-store";

// ── Config ────────────────────────────────────────────────────────────────────
const MERCHANTS_TABLE = process.env.OTS_MERCHANTS_TABLE || "zalyx_merchants";
const DECISIONS_TABLE = process.env.OTS_DECISIONS_TABLE || "zalyx_decisions";
const DECISION_INDEX = "decision_index";

function hasCredentials(): boolean {
  return Boolean(
    process.env.OTS_ENDPOINT &&
      process.env.OTS_INSTANCE &&
      process.env.OTS_ACCESS_KEY_ID &&
      process.env.OTS_ACCESS_KEY_SECRET
  );
}

export let tablestoreMockMode = !hasCredentials();

// ── Exported row shapes ─────────────────────────────────────────────────────
export interface DecisionSummaryRow {
  merchantId: string;
  requestId: string;
  decision: string;
  createdAt: string;
  approvedAmountNaira?: number;
  executionTime?: string;
}
export interface DecisionTypeRow {
  merchantId: string;
  requestId: string;
  decision: string;
  createdAt: string;
  approvedAmountNaira?: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Initialise tables + index and seed merchants. Call once on server start. */
export async function initTablestore(): Promise<void> {
  if (tablestoreMockMode) {
    console.log("  ⚠️  Tablestore mock mode — reading merchants from data/snapshots, decisions from local JSON");
    return;
  }
  // Real-mode init is implemented in Task 3.
  await initRealTablestore();
}

export async function getMerchantSnapshot(id: string): Promise<ZalyxMerchantSnapshot | null> {
  if (tablestoreMockMode) {
    const fp = path.join(process.cwd(), `data/snapshots/${id}.json`);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as ZalyxMerchantSnapshot;
  }
  return getMerchantSnapshotReal(id);
}

export async function listMerchants(): Promise<ZalyxMerchantSnapshot[]> {
  if (tablestoreMockMode) {
    const dir = path.join(process.cwd(), "data/snapshots");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
  }
  return listMerchantsReal();
}

export async function saveMerchantSnapshot(snapshot: ZalyxMerchantSnapshot): Promise<void> {
  if (tablestoreMockMode) return; // snapshots live in data/snapshots in mock mode
  return saveMerchantSnapshotReal(snapshot);
}

export async function saveUnderwritingDecision(report: UnderwritingReport): Promise<void> {
  const r = report as unknown as Record<string, unknown>;
  const humanReview = r["humanReview"] as Record<string, unknown>;
  const observability = r["observability"] as Record<string, unknown>;
  const row: StoredDecision = {
    merchantId: report.merchantId,
    requestId: observability["requestId"] as string,
    decision: humanReview["finalRecommendation"] as string,
    approvedAmountNaira: (humanReview["approvedAmountNaira"] as number) ?? 0,
    executionTime: report.executionTime,
    createdAt: new Date().toISOString(),
    report,
  };
  if (tablestoreMockMode) {
    appendLocalDecision(row);
    console.log(`  💾 [mock] Saved decision: ${row.merchantId} → ${row.decision} (${row.requestId})`);
    return;
  }
  return saveUnderwritingDecisionReal(row);
}

export async function getDecisionsForMerchant(merchantId: string): Promise<UnderwritingReport[]> {
  if (tablestoreMockMode) {
    return readLocalDecisions()
      .filter((d) => d.merchantId === merchantId)
      .sort((a, b) => b.requestId.localeCompare(a.requestId)) // newest first
      .map((d) => d.report);
  }
  return getDecisionsForMerchantReal(merchantId);
}

export async function getMerchantDecisionSummaries(merchantId: string): Promise<DecisionSummaryRow[]> {
  if (tablestoreMockMode) {
    return readLocalDecisions()
      .filter((d) => d.merchantId === merchantId)
      .sort((a, b) => b.requestId.localeCompare(a.requestId))
      .map(({ merchantId, requestId, decision, createdAt, approvedAmountNaira, executionTime }) => ({
        merchantId,
        requestId,
        decision,
        createdAt,
        approvedAmountNaira,
        executionTime,
      }));
  }
  return getMerchantDecisionSummariesReal(merchantId);
}

export async function getDecisionById(
  merchantId: string,
  requestId: string
): Promise<{ report: UnderwritingReport; createdAt: string } | null> {
  if (tablestoreMockMode) {
    const hit = readLocalDecisions().find((d) => d.merchantId === merchantId && d.requestId === requestId);
    return hit ? { report: hit.report, createdAt: hit.createdAt } : null;
  }
  return getDecisionByIdReal(merchantId, requestId);
}

export async function listDecisionsByType(
  decisionType: "approved" | "rejected" | "requires-clarification",
  limit = 50
): Promise<DecisionTypeRow[]> {
  if (tablestoreMockMode) {
    return readLocalDecisions()
      .filter((d) => d.decision === decisionType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ merchantId, requestId, decision, createdAt, approvedAmountNaira }) => ({
        merchantId,
        requestId,
        decision,
        createdAt,
        approvedAmountNaira,
      }));
  }
  return listDecisionsByTypeReal(decisionType, limit);
}

// ── Real Tablestore backend (implemented in Task 3) ──────────────────────────
/* eslint-disable @typescript-eslint/no-unused-vars */
async function initRealTablestore(): Promise<void> { throw new Error("real Tablestore not yet implemented"); }
async function getMerchantSnapshotReal(_id: string): Promise<ZalyxMerchantSnapshot | null> { throw new Error("not impl"); }
async function listMerchantsReal(): Promise<ZalyxMerchantSnapshot[]> { throw new Error("not impl"); }
async function saveMerchantSnapshotReal(_s: ZalyxMerchantSnapshot): Promise<void> { throw new Error("not impl"); }
async function saveUnderwritingDecisionReal(_r: StoredDecision): Promise<void> { throw new Error("not impl"); }
async function getDecisionsForMerchantReal(_m: string): Promise<UnderwritingReport[]> { throw new Error("not impl"); }
async function getMerchantDecisionSummariesReal(_m: string): Promise<DecisionSummaryRow[]> { throw new Error("not impl"); }
async function getDecisionByIdReal(_m: string, _r: string): Promise<{ report: UnderwritingReport; createdAt: string } | null> { throw new Error("not impl"); }
async function listDecisionsByTypeReal(_d: string, _l: number): Promise<DecisionTypeRow[]> { throw new Error("not impl"); }

// Suppress unused variable warnings for table/index constants used in Task 3
void MERCHANTS_TABLE; void DECISIONS_TABLE; void DECISION_INDEX;
