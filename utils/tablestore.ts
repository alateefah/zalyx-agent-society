/**
 * Alibaba Cloud Tablestore (OTS) persistence — Zalyx Underwriting.
 *
 * Two tables:
 *   zalyx_merchants  — merchant snapshots (PK: id)
 *   zalyx_decisions  — underwriting reports (PK: merchantId + requestId)
 *                      global secondary index `decision_index` on (decision, createdAt)
 *                      → "all approvals / rejections across merchants"
 *
 * Production reads/writes merchants and decisions from Tablestore when
 * DATA_BACKEND=tablestore and OTS_* credentials are present. Local development
 * reads merchant snapshots from data/snapshots and stores decisions in JSON.
 */
import fs from "fs";
import path from "path";
import { FinancialSnapshotSummary, FinancingOfferRange, ZalyxMerchantSnapshot, UnderwritingReport } from "./types";
import {
  StoredDecision,
  readLocalDecisions,
  appendLocalDecision,
} from "./local-decision-store";

// eslint-disable-next-line @typescript-eslint/no-var-requires
import TableStore = require("tablestore");

let _client: any = null;
function client(): any {
  if (_client) return _client;
  _client = new TableStore.Client({
    accessKeyId: process.env.OTS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.OTS_ACCESS_KEY_SECRET!,
    endpoint: process.env.OTS_ENDPOINT!,
    instancename: process.env.OTS_INSTANCE!,
    maxRetries: 3,
  });
  return _client;
}

// All SDK methods take (params, callback); wrap them as promises.
function call<T = any>(method: string, params: any): Promise<T> {
  return new Promise((resolve, reject) => {
    client()[method](params, (err: any, data: T) => (err ? reject(err) : resolve(data)));
  });
}

/** Tablestore row attributes come back as [{ columnName, columnValue }]; flatten to a map. */
function attrsToMap(row: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const a of row?.attributes ?? []) out[a.columnName] = a.columnValue;
  for (const pk of row?.primaryKey ?? []) out[pk.name] = pk.value;
  return out;
}

// ── Config ────────────────────────────────────────────────────────────────────
const MERCHANTS_TABLE = process.env.OTS_MERCHANTS_TABLE || "zalyx_merchants";
const DECISIONS_TABLE = process.env.OTS_DECISIONS_TABLE || "zalyx_decisions";
const DECISION_INDEX = "decision_index";
const DATA_BACKEND = (process.env.DATA_BACKEND || (process.env.NODE_ENV === "production" ? "tablestore" : "local")).toLowerCase();

function hasCredentials(): boolean {
  return Boolean(
    process.env.OTS_ENDPOINT &&
      process.env.OTS_INSTANCE &&
      process.env.OTS_ACCESS_KEY_ID &&
      process.env.OTS_ACCESS_KEY_SECRET
  );
}

export const tablestoreConfigured = DATA_BACKEND === "tablestore" && hasCredentials();

function useLocalDecisionStore(): boolean {
  const preference = (process.env.DECISION_STORE || "auto").toLowerCase();
  return preference === "local" || !tablestoreConfigured;
}

export const decisionStoreMode = useLocalDecisionStore() ? "local-json" : "tablestore";

function localMerchantsDir(): string {
  return process.env.LOCAL_MERCHANTS_DIR || path.join(process.cwd(), "data", "snapshots");
}

// ── Exported row shapes ─────────────────────────────────────────────────────
export interface DecisionSummaryRow {
  merchantId: string;
  requestId: string;
  decision: string;
  createdAt: string;
  approvedAmountNaira?: number;
  approvedRange?: FinancingOfferRange;
  financialSnapshot?: FinancialSnapshotSummary;
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

/** Initialise tables + index. Call once on server start. */
export async function initTablestore(): Promise<void> {
  if (!tablestoreConfigured) {
    console.log("  ℹ️  Tablestore credentials not set — merchants read from local snapshots; decisions use local JSON");
    return;
  }
  await initRealTablestore();
}

export async function getMerchantSnapshot(id: string): Promise<ZalyxMerchantSnapshot | null> {
  if (!tablestoreConfigured) return getLocalMerchantSnapshot(id);
  return getMerchantSnapshotReal(id);
}

export async function listMerchants(): Promise<ZalyxMerchantSnapshot[]> {
  if (!tablestoreConfigured) return listLocalMerchantSnapshots();
  return listMerchantsReal();
}

export async function saveMerchantSnapshot(snapshot: ZalyxMerchantSnapshot): Promise<void> {
  if (!tablestoreConfigured) return saveLocalMerchantSnapshot(snapshot);
  return saveMerchantSnapshotReal(snapshot);
}

export async function saveUnderwritingDecision(report: UnderwritingReport): Promise<void> {
  const row: StoredDecision = {
    merchantId: report.merchantId,
    requestId: report.observability.requestId,
    decision: report.humanReview.finalRecommendation,
    approvedAmountNaira: report.humanReview.approvedAmountNaira ?? 0,
    executionTime: report.executionTime,
    createdAt: new Date().toISOString(),
    report,
  };
  if (useLocalDecisionStore()) {
    appendLocalDecision(row);
    console.log(`  💾 Saved decision locally: ${row.merchantId} → ${row.decision} (${row.requestId})`);
    return;
  }
  return saveUnderwritingDecisionReal(row);
}

export async function getDecisionsForMerchant(merchantId: string): Promise<UnderwritingReport[]> {
  if (useLocalDecisionStore()) {
    return readLocalDecisions()
      .filter((d) => d.merchantId === merchantId)
      .sort((a, b) => b.requestId.localeCompare(a.requestId)) // newest first
      .map((d) => d.report);
  }
  return getDecisionsForMerchantReal(merchantId);
}

export async function getMerchantDecisionSummaries(merchantId: string): Promise<DecisionSummaryRow[]> {
  if (useLocalDecisionStore()) {
    return readLocalDecisions()
      .filter((d) => d.merchantId === merchantId)
      .sort((a, b) => b.requestId.localeCompare(a.requestId))
      .map(({ merchantId, requestId, decision, createdAt, approvedAmountNaira, executionTime, report }) => ({
        merchantId,
        requestId,
        decision,
        createdAt,
        approvedAmountNaira,
        approvedRange: report.humanReview?.approvedRange ?? report.financingStructure?.offerRange,
        financialSnapshot: report.financialSnapshot,
        executionTime,
      }));
  }
  return getMerchantDecisionSummariesReal(merchantId);
}

export async function getDecisionById(
  merchantId: string,
  requestId: string
): Promise<{ report: UnderwritingReport; createdAt: string } | null> {
  if (useLocalDecisionStore()) {
    const hit = readLocalDecisions().find((d) => d.merchantId === merchantId && d.requestId === requestId);
    return hit ? { report: hit.report, createdAt: hit.createdAt } : null;
  }
  return getDecisionByIdReal(merchantId, requestId);
}

export async function listDecisionsByType(
  decisionType: "approved" | "rejected" | "requires-clarification",
  limit = 50
): Promise<DecisionTypeRow[]> {
  if (useLocalDecisionStore()) {
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

// ── Real Tablestore backend ──────────────────────────────────────────────────

function localMerchantFile(id: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "_");
  return path.join(localMerchantsDir(), `${safeId}.json`);
}

function readSnapshotFile(filePath: string): ZalyxMerchantSnapshot {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as ZalyxMerchantSnapshot;
}

async function getLocalMerchantSnapshot(id: string): Promise<ZalyxMerchantSnapshot | null> {
  const fp = localMerchantFile(id);
  if (!fs.existsSync(fp)) return null;
  return readSnapshotFile(fp);
}

async function listLocalMerchantSnapshots(): Promise<ZalyxMerchantSnapshot[]> {
  const dir = localMerchantsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readSnapshotFile(path.join(dir, f)));
}

async function saveLocalMerchantSnapshot(snapshot: ZalyxMerchantSnapshot): Promise<void> {
  const fp = localMerchantFile(snapshot.id);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`  💾 Saved local merchant snapshot: ${snapshot.id}`);
}

async function tableExists(name: string): Promise<boolean> {
  const { tableNames } = await call<{ tableNames: string[] }>("listTable", {});
  return (tableNames ?? []).includes(name);
}

async function initRealTablestore(): Promise<void> {
  try {
    if (!(await tableExists(MERCHANTS_TABLE))) {
      console.log(`  📦 Creating Tablestore table: ${MERCHANTS_TABLE}`);
      await call("createTable", {
        tableMeta: {
          tableName: MERCHANTS_TABLE,
          primaryKey: [{ name: "id", type: TableStore.PrimaryKeyType.STRING }],
        },
        reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
        tableOptions: { timeToLive: -1, maxVersions: 1 },
      });
    }

    if (!(await tableExists(DECISIONS_TABLE))) {
      console.log(`  📦 Creating Tablestore table + index: ${DECISIONS_TABLE}`);
      await call("createTable", {
        tableMeta: {
          tableName: DECISIONS_TABLE,
          primaryKey: [
            { name: "merchantId", type: TableStore.PrimaryKeyType.STRING },
            { name: "requestId", type: TableStore.PrimaryKeyType.STRING },
          ],
          definedColumn: [
            { name: "decision", type: TableStore.DefinedColumnType.DCT_STRING },
            { name: "createdAt", type: TableStore.DefinedColumnType.DCT_STRING },
            { name: "approvedAmountNaira", type: TableStore.DefinedColumnType.DCT_INTEGER },
          ],
        },
        reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
        tableOptions: { timeToLive: -1, maxVersions: 1 },
        indexMetas: [
          {
            name: DECISION_INDEX,
            primaryKey: ["decision", "createdAt"],
            definedColumn: ["approvedAmountNaira"],
            indexUpdateMode: TableStore.IndexUpdateMode.IUM_ASYNC_INDEX,
            indexType: TableStore.IndexType.IT_GLOBAL_INDEX,
          },
        ],
      });
    }

    console.log("✅ Tablestore ready");
  } catch (err) {
    console.error("❌ Tablestore init failed:", err);
    throw err;
  }
}

export async function seedMerchantTableFromSnapshots(): Promise<number> {
  if (!tablestoreConfigured) {
    throw new Error("OTS_* credentials are required to seed the merchant table.");
  }
  return seedMerchantSnapshotsFromDisk();
}

async function seedMerchantSnapshotsFromDisk(): Promise<number> {
  const dir = localMerchantsDir();
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const snap: ZalyxMerchantSnapshot = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    const existing = await getMerchantSnapshotReal(snap.id);
    if (!existing) {
      await saveMerchantSnapshotReal(snap);
      console.log(`  📥 Seeded merchant: ${snap.id}`);
      count += 1;
    }
  }
  return count;
}

async function deleteTableIfExists(tableName: string): Promise<void> {
  if (!(await tableExists(tableName))) return;
  console.log(`  🧹 Deleting Tablestore table: ${tableName}`);
  await call("deleteTable", { tableName });
  await waitForTableDeletion(tableName);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTableDeletion(tableName: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await tableExists(tableName))) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for Tablestore table deletion: ${tableName}`);
}

export async function resetTablestoreAndSeedMerchants(): Promise<void> {
  if (!tablestoreConfigured) {
    throw new Error("OTS_* credentials are required to reset Alibaba Cloud Tablestore.");
  }

  await deleteTableIfExists(DECISIONS_TABLE);
  await deleteTableIfExists(MERCHANTS_TABLE);
  _client = null;

  await initRealTablestore();
  const seeded = await seedMerchantSnapshotsFromDisk();
  console.log(`  📥 Seeded ${seeded} merchant snapshot(s)`);
}

async function getMerchantSnapshotReal(id: string): Promise<ZalyxMerchantSnapshot | null> {
  const data = await call<any>("getRow", {
    tableName: MERCHANTS_TABLE,
    primaryKey: [{ id }],
    maxVersions: 1,
  });
  if (!data?.row?.primaryKey) return null;
  const map = attrsToMap(data.row);
  return JSON.parse(map.data) as ZalyxMerchantSnapshot;
}

async function listMerchantsReal(): Promise<ZalyxMerchantSnapshot[]> {
  const out: ZalyxMerchantSnapshot[] = [];
  let start: any = [{ id: TableStore.INF_MIN }];
  while (start) {
    const data = await call<any>("getRange", {
      tableName: MERCHANTS_TABLE,
      direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: start,
      exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
      limit: 100,
    });
    for (const row of data.rows ?? []) out.push(JSON.parse(attrsToMap(row).data));
    start = data.nextStartPrimaryKey ?? null;
  }
  return out;
}

async function saveMerchantSnapshotReal(snapshot: ZalyxMerchantSnapshot): Promise<void> {
  await call("putRow", {
    tableName: MERCHANTS_TABLE,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
    primaryKey: [{ id: snapshot.id }],
    attributeColumns: [{ data: JSON.stringify(snapshot) }],
  });
}

async function saveUnderwritingDecisionReal(row: StoredDecision): Promise<void> {
  await call("putRow", {
    tableName: DECISIONS_TABLE,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
    primaryKey: [{ merchantId: row.merchantId }, { requestId: row.requestId }],
    attributeColumns: [
      { decision: row.decision },
      { createdAt: row.createdAt },
      { approvedAmountNaira: TableStore.Long.fromNumber(row.approvedAmountNaira) },
      { executionTime: row.executionTime },
      { report: JSON.stringify(row.report) },
    ],
  });
}

async function rangeDecisionsForMerchant(merchantId: string): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  let start: any = [{ merchantId }, { requestId: TableStore.INF_MAX }];
  while (start) {
    const data = await call<any>("getRange", {
      tableName: DECISIONS_TABLE,
      direction: TableStore.Direction.BACKWARD, // newest first
      inclusiveStartPrimaryKey: start,
      exclusiveEndPrimaryKey: [{ merchantId }, { requestId: TableStore.INF_MIN }],
      limit: 100,
    });
    for (const row of data.rows ?? []) rows.push(attrsToMap(row));
    start = data.nextStartPrimaryKey ?? null;
  }
  return rows;
}

async function getDecisionsForMerchantReal(merchantId: string): Promise<UnderwritingReport[]> {
  return (await rangeDecisionsForMerchant(merchantId)).map((m) => JSON.parse(m.report) as UnderwritingReport);
}

async function getMerchantDecisionSummariesReal(merchantId: string): Promise<DecisionSummaryRow[]> {
  return (await rangeDecisionsForMerchant(merchantId)).map((m) => ({
    merchantId: m.merchantId,
    requestId: m.requestId,
    decision: m.decision,
    createdAt: m.createdAt,
    approvedAmountNaira: typeof m.approvedAmountNaira?.toNumber === "function" ? m.approvedAmountNaira.toNumber() : Number(m.approvedAmountNaira ?? 0),
    approvedRange: parseApprovedRange(m.report),
    financialSnapshot: parseFinancialSnapshot(m.report),
    executionTime: m.executionTime,
  }));
}

function parseApprovedRange(reportJson?: string): FinancingOfferRange | undefined {
  if (!reportJson) return undefined;
  try {
    const report = JSON.parse(reportJson) as UnderwritingReport;
    return report.humanReview?.approvedRange ?? report.financingStructure?.offerRange;
  } catch {
    return undefined;
  }
}

function parseFinancialSnapshot(reportJson?: string): FinancialSnapshotSummary | undefined {
  if (!reportJson) return undefined;
  try {
    const report = JSON.parse(reportJson) as UnderwritingReport;
    return report.financialSnapshot;
  } catch {
    return undefined;
  }
}

async function getDecisionByIdReal(
  merchantId: string,
  requestId: string
): Promise<{ report: UnderwritingReport; createdAt: string } | null> {
  const data = await call<any>("getRow", {
    tableName: DECISIONS_TABLE,
    primaryKey: [{ merchantId }, { requestId }],
    maxVersions: 1,
  });
  if (!data?.row?.primaryKey) return null;
  const map = attrsToMap(data.row);
  return { report: JSON.parse(map.report) as UnderwritingReport, createdAt: map.createdAt };
}

async function listDecisionsByTypeReal(
  decisionType: string,
  limit: number
): Promise<DecisionTypeRow[]> {
  const data = await call<any>("getRange", {
    tableName: DECISION_INDEX,
    direction: TableStore.Direction.BACKWARD, // newest createdAt first
    inclusiveStartPrimaryKey: [
      { decision: decisionType },
      { createdAt: TableStore.INF_MAX },
      { merchantId: TableStore.INF_MAX },
      { requestId: TableStore.INF_MAX },
    ],
    exclusiveEndPrimaryKey: [
      { decision: decisionType },
      { createdAt: TableStore.INF_MIN },
      { merchantId: TableStore.INF_MIN },
      { requestId: TableStore.INF_MIN },
    ],
    limit,
  });
  return (data.rows ?? []).map((row: any) => {
    const m = attrsToMap(row);
    return {
      merchantId: m.merchantId,
      requestId: m.requestId,
      decision: m.decision,
      createdAt: m.createdAt,
      approvedAmountNaira: typeof m.approvedAmountNaira?.toNumber === "function" ? m.approvedAmountNaira.toNumber() : Number(m.approvedAmountNaira ?? 0),
    };
  });
}
