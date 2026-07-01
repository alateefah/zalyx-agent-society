import { API_BASE } from "./constants";
import type {
  ZalyxMerchantSnapshot,
  UnderwritingReport,
  BaselineReport,
  DecisionHistoryEntry,
  DecisionSummary,
  AgentProgressEvent,
} from "../types";

export async function fetchHealth(): Promise<{ mockMode: boolean }> {
  const r = await fetch(`${API_BASE}/api/health`);
  const h = await r.json();
  return { mockMode: h.database?.mockMode ?? h.mockMode ?? false };
}

export async function fetchMerchants(): Promise<ZalyxMerchantSnapshot[]> {
  const r = await fetch(`${API_BASE}/api/merchants`);
  if (!r.ok) throw new Error("Failed to load merchants");
  return r.json();
}

export async function fetchDecisionHistory(merchantId: string): Promise<DecisionHistoryEntry[]> {
  const r = await fetch(`${API_BASE}/api/decisions/${merchantId}`);
  if (!r.ok) throw new Error("Failed to load history");
  const reports: UnderwritingReport[] = await r.json();
  return reports.map((rep) => ({
    merchantId: rep.merchantId,
    requestId: rep.observability?.requestId ?? "-",
    decision: rep.humanReview?.finalRecommendation ?? "requires-clarification",
    createdAt: rep.observability?.requestId
      ? rep.observability.requestId.split("-")[0]   // ISO prefix we set
      : new Date().toISOString(),
    approvedAmountNaira: rep.humanReview?.approvedAmountNaira,
    report: rep,
  }));
}

/** Fetch a single merchant by ID from the dedicated endpoint. */
export async function fetchMerchantById(merchantId: string): Promise<ZalyxMerchantSnapshot> {
  const r = await fetch(`${API_BASE}/api/merchants/${encodeURIComponent(merchantId)}`);
  if (r.status === 404) throw new Error(`Merchant ${merchantId} not found`);
  if (!r.ok) throw new Error("Failed to load merchant");
  return r.json();
}

/** Fetch lightweight decision summaries — no report blob. */
export async function fetchDecisionSummaries(merchantId: string): Promise<DecisionSummary[]> {
  const r = await fetch(`${API_BASE}/api/merchants/${encodeURIComponent(merchantId)}/decisions`);
  if (!r.ok) throw new Error("Failed to load decisions");
  return r.json();
}

/** Fetch a single full decision report via O(1) GetCommand. */
export async function fetchDecisionById(
  merchantId: string,
  requestId: string
): Promise<{ report: UnderwritingReport; createdAt: string }> {
  const r = await fetch(
    `${API_BASE}/api/merchants/${encodeURIComponent(merchantId)}/decisions/${encodeURIComponent(requestId)}`
  );
  if (r.status === 404) throw new Error("not_found");
  if (!r.ok) throw new Error("Failed to load decision");
  return r.json();
}

export async function fetchBaseline(snapshot: ZalyxMerchantSnapshot): Promise<BaselineReport | null> {
  const r = await fetch(`${API_BASE}/api/baseline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  return r.ok ? r.json() : null;
}

export async function streamUnderwriting(
  snapshot: ZalyxMerchantSnapshot,
  onEvent: (evt: AgentProgressEvent) => void
): Promise<UnderwritingReport> {
  const res = await fetch(`${API_BASE}/api/underwrite/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Underwriting failed");
  }

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let finalReport: UnderwritingReport | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const evt: AgentProgressEvent = JSON.parse(line.slice(6));
      onEvent(evt);
      if (evt.type === "done") finalReport = evt.report;
      if (evt.type === "error") throw new Error(evt.message);
    }
  }

  if (!finalReport) throw new Error("No report received from stream");
  return finalReport;
}
