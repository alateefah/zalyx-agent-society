import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import { Header }     from "../components/layout/Header";
import { ReportView } from "../components/report/ReportView";

import { useIsMock }  from "../hooks/useIsMock";
import { fetchDecisionById, fetchMerchantById } from "../utils/api";
import { fmtDate, fmtTime }                     from "../utils/format";

import type { UnderwritingReport, ZalyxMerchantSnapshot } from "../types";

type PageState = "loading" | "ready" | "not_found" | "error";

export function DecisionReport() {
  const { merchantId, requestId } = useParams<{ merchantId: string; requestId: string }>();
  const navigate = useNavigate();
  const isMock = useIsMock();

  const [report, setReport]     = useState<UnderwritingReport | null>(null);
  const [merchant, setMerchant] = useState<ZalyxMerchantSnapshot | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");

  // Component is remounted by DecisionReportPage wrapper when merchantId/requestId change,
  // so pageState always starts as "loading" — no synchronous setState reset needed.
  useEffect(() => {
    if (!merchantId || !requestId) return;
    let cancelled = false;
    Promise.all([
      fetchDecisionById(merchantId, requestId),
      fetchMerchantById(merchantId).catch(() => null),
    ])
      .then(([{ report: r, createdAt: ca }, m]) => {
        if (cancelled) return;
        setReport(r);
        setCreatedAt(ca);
        setMerchant(m);
        setPageState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        setPageState(msg === "not_found" ? "not_found" : "error");
      });
    return () => { cancelled = true; };
  }, [merchantId, requestId]);

  const merchantName = merchant?.businessName ?? merchantId ?? "Merchant";
  const workspacePath = `/merchants/${merchantId}`;

  const breadcrumbs = [
    { label: "Merchants", to: "/" },
    { label: merchantName, to: workspacePath },
    { label: createdAt ? `${fmtDate(createdAt)} ${fmtTime(createdAt)}` : requestId ?? "Decision" },
  ];

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <div className="app">
        <Header isMock={isMock} breadcrumbs={breadcrumbs} />
        <main className="app-main">
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-3)" }}>
            <div style={{ marginBottom: 12, fontSize: 14 }}>Loading decision report…</div>
            <div style={{
              width: 32, height: 32, margin: "0 auto",
              border: "2px solid var(--border)", borderTopColor: "var(--primary)",
              borderRadius: "50%", animation: "spin 0.8s linear infinite",
            }} />
          </div>
        </main>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (pageState === "not_found") {
    return (
      <div className="app">
        <Header isMock={isMock} breadcrumbs={[{ label: "Merchants", to: "/" }, { label: merchantName, to: workspacePath }]} />
        <main className="app-main">
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>404</div>
            <div style={{ color: "var(--text-2)", marginBottom: 8 }}>Decision report not found.</div>
            <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 24 }}>
              It may have been run in mock mode (not persisted) or the ID is incorrect.
            </div>
            <Link to={workspacePath} className="btn-secondary" style={{ textDecoration: "none" }}>
              ← Back to {merchantName}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (pageState === "error" || !report) {
    return (
      <div className="app">
        <Header isMock={isMock} breadcrumbs={[{ label: "Merchants", to: "/" }, { label: merchantName, to: workspacePath }]} />
        <main className="app-main">
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ color: "var(--red)", marginBottom: 12 }}>Failed to load decision report.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn-primary" onClick={() => setPageState("loading")}>
                Retry
              </button>
              <Link to={workspacePath} className="btn-secondary" style={{ textDecoration: "none" }}>
                ← Back to {merchantName}
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <Header isMock={isMock} breadcrumbs={breadcrumbs} />

      {/* "Run again" strip above the report */}
      <div style={{
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        padding: "10px 15%", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link
          to={workspacePath}
          style={{ fontSize: 13, color: "var(--text-2)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to {merchantName}
        </Link>
        <button
          className="btn-secondary"
          onClick={() => navigate(workspacePath)}
          style={{ fontSize: 12 }}
        >
          Run new underwriting ↗
        </button>
      </div>

      <main className="app-main">
        <ReportView
          report={report}
          baseline={null}
          isMock={isMock}
          merchantId={merchantId ?? ""}
          onBack={() => navigate(workspacePath)}
        />
      </main>
    </div>
  );
}
