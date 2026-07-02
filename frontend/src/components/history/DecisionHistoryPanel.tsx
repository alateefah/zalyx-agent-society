import { useState, useEffect } from "react";
import { History, ChevronDown } from "lucide-react";
import { fetchDecisionHistory } from "../../utils/api";
import { fmt, fmtDate, fmtTime } from "../../utils/format";
import type { DecisionHistoryEntry, UnderwritingReport } from "../../types";

interface Props {
  merchantId: string;
  onLoadReport: (report: UnderwritingReport) => void;
}

const DECISION_COLOR: Record<string, string> = {
  approved: "#15803d",
  rejected: "#b91c1c",
  "requires-clarification": "#b45309",
};

export function DecisionHistoryPanel({ merchantId, onLoadReport }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<DecisionHistoryEntry[]>([]);

  // When merchant changes, this component is remounted via key={merchantId} in App.tsx
  // so no manual reset is needed here.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchDecisionHistory(merchantId);
        if (!cancelled) setHistory(data);
      } catch {
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, merchantId]);

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          cursor: "pointer", fontSize: 12, color: "var(--text-muted)", userSelect: "none",
        }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
      >
        <History size={12} />
        Past decisions for {merchantId}
        <ChevronDown
          size={12}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </div>

      {open && (
        <div style={{ marginTop: 6, borderRadius: 8, background: "var(--surface-raised)", padding: "8px 10px" }}>
          {loading && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading from Tablestore…</div>
          )}
          {!loading && history.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              No past decisions — run monthly review to create one.
            </div>
          )}
          {!loading && history.map((entry, i) => (
            <div
              key={entry.requestId}
              role="button"
              tabIndex={0}
              onClick={() => onLoadReport(entry.report)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onLoadReport(entry.report)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 4px",
                borderBottom: i < history.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  fontSize: 12, fontWeight: 600, minWidth: 80,
                  color: DECISION_COLOR[entry.decision] ?? "var(--text-secondary)",
                }}
              >
                {entry.decision}
              </span>
              {entry.approvedAmountNaira != null && entry.approvedAmountNaira > 0 && (
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {fmt(entry.approvedAmountNaira)}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
                {fmtDate(entry.createdAt)} {fmtTime(entry.createdAt)}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                →
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
