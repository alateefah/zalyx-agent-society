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

// ── Real Tablestore backend ──────────────────────────────────────────────────

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

    await seedMerchantsIfEmpty();
    console.log("✅ Tablestore ready");
  } catch (err) {
    console.error("❌ Tablestore init failed — falling back to mock mode:", err);
    tablestoreMockMode = true;
  }
}

async function seedMerchantsIfEmpty(): Promise<void> {
  const dir = path.join(process.cwd(), "data/snapshots");
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const snap: ZalyxMerchantSnapshot = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    const existing = await getMerchantSnapshotReal(snap.id);
    if (!existing) {
      await saveMerchantSnapshotReal(snap);
      console.log(`  📥 Seeded merchant: ${snap.id}`);
    }
  }
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
    executionTime: m.executionTime,
  }));
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
