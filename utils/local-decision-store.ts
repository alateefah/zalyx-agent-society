/**
 * Local JSON decision store.
 *
 * This is a lightweight development store for underwriting outputs. Merchant
 * snapshots live in the local snapshots directory for local runs; this file
 * preserves decision history when a local run is not writing decisions to
 * Alibaba Cloud Tablestore.
 */
import fs from "fs";
import path from "path";
import { UnderwritingReport } from "./types";

export interface StoredDecision {
  merchantId: string;
  requestId: string;
  decision: string;
  createdAt: string;
  approvedAmountNaira: number;
  executionTime: string;
  report: UnderwritingReport;
}

function filePath(): string {
  return process.env.LOCAL_DECISIONS_FILE || path.join(process.cwd(), "data", "decisions.local.json");
}

export function readLocalDecisions(): StoredDecision[] {
  const fp = filePath();
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as StoredDecision[];
  } catch {
    return [];
  }
}

export function appendLocalDecision(d: StoredDecision): void {
  const fp = filePath();
  const all = readLocalDecisions();
  // De-dupe on composite key so re-runs overwrite rather than duplicate.
  const next = all.filter((x) => !(x.merchantId === d.merchantId && x.requestId === d.requestId));
  next.push(d);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), "utf-8");
}
