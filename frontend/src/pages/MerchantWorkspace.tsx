import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { Zap, ExternalLink } from "lucide-react";

import { Header }           from "../components/layout/Header";
import { MerchantSnapshot } from "../components/merchant/MerchantSnapshot";
import { ProcessingView }   from "../components/processing/ProcessingView";

import { useIsMock }        from "../hooks/useIsMock";
import { useUnderwriting }  from "../hooks/useUnderwriting";

import {
  fetchMerchantById,
  fetchDecisionSummaries,
} from "../utils/api";
import { fmt, fmtDate, fmtTime } from "../utils/format";

import type { ZalyxMerchantSnapshot, DecisionSummary } from "../types";

const DECISION_COLOR: Record<string, string> = {
  approved:                 "var(--green)",
  rejected:                 "var(--red)",
  "requires-clarification": "var(--amber)",
};

export function MerchantWorkspace() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isMock = useIsMock();
  // Custom merchants passed via navigation state (not persisted on the backend)
  const passedMerchant = (location.state as { merchant?: ZalyxMerchantSnapshot } | null)?.merchant ?? null;

  const [merchant, setMerchant] = useState<ZalyxMerchantSnapshot | null>(null);
  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);
  const [pageState, setPageState] = useState<"loading" | "ready" | "not_found" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const { view, processingLabel, liveMessages, error, run } = useUnderwriting();

  // Component is remounted by MerchantWorkspacePage wrapper when merchantId changes,
  // so pageState always starts as "loading" — no synchronous setState needed.
  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    (async () => {
      try {
        // Custom merchants (e.g. DEMO-LIVE) are passed via navigation state and
        // never persisted on the backend — use state directly, skip the API call.
        const m = passedMerchant ?? await fetchMerchantById(merchantId);
        const s = await fetchDecisionSummaries(merchantId).catch(() => [] as DecisionSummary[]);
        if (cancelled) return;
        setMerchant(m);
        setSummaries(s);
        setPageState("ready");
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        setPageState(msg === `Merchant ${merchantId} not found` ? "not_found" : "error");
      }
    })();
    return () => { cancelled = true; };
  }, [merchantId, retryCount, passedMerchant]);

  const handleRun = async () => {
    if (!merchant) return;
    setIsRunning(true);
    try {
      const result = await run(merchant);
      if (result) {
        const reqId = result.observability?.requestId;
        await fetchDecisionSummaries(merchantId!).then(setSummaries).catch(() => undefined);
        if (reqId) navigate(`/merchants/${merchantId}/decisions/${reqId}`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleRetry = () => {
    setPageState("loading");
    setRetryCount((c) => c + 1);
  };

  // ── Processing overlay ────────────────────────────────────────────────────────
  if (view === "processing") {
    return (
      <div className="app">
        <Header
          isMock={isMock}
          breadcrumbs={[
            { label: "Merchants", to: "/" },
            { label: merchant?.businessName ?? merchantId ?? "…", to: `/merchants/${merchantId}` },
            { label: "Running…" },
          ]}
        />
        <main className="app-main">
          <ProcessingView
            merchantId={merchantId ?? ""}
            label={processingLabel}
            isMock={isMock}
            liveMessages={liveMessages}
          />
        </main>
      </div>
    );
  }

  // ── Loading / error states ────────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <div className="app">
        <Header isMock={isMock} breadcrumbs={[{ label: "Merchants", to: "/" }, { label: merchantId ?? "…" }]} />
        <main className="app-main">
          <div style={{ color: "var(--text-3)", padding: "60px 0", textAlign: "center" }}>
            Loading merchant…
          </div>
        </main>
      </div>
    );
  }

  if (pageState === "not_found") {
    return (
      <div className="app">
        <Header isMock={isMock} breadcrumbs={[{ label: "Merchants", to: "/" }, { label: merchantId ?? "" }]} />
        <main className="app-main">
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>404</div>
            <div style={{ color: "var(--text-2)", marginBottom: 20 }}>
              Merchant <strong>{merchantId}</strong> not found.
            </div>
            <Link to="/" className="btn-secondary" style={{ textDecoration: "none" }}>← Back to merchants</Link>
          </div>
        </main>
      </div>
    );
  }

  if (pageState === "error" || !merchant) {
    return (
      <div className="app">
        <Header isMock={isMock} breadcrumbs={[{ label: "Merchants", to: "/" }]} />
        <main className="app-main">
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ color: "var(--red)", marginBottom: 12 }}>Failed to load merchant</div>
            <button className="btn-secondary" onClick={handleRetry}>Retry</button>
          </div>
        </main>
      </div>
    );
  }

  const latest = summaries[0];

  // ── Workspace ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <Header
        isMock={isMock}
        breadcrumbs={[
          { label: "Merchants", to: "/" },
          { label: merchant.businessName },
        ]}
      />

      <main className="app-main">
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          {/* ── Merchant header ───────────────────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                    background: "var(--primary-dim)", color: "var(--primary)",
                    padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
                  }}>
                    {merchant.id}
                  </span>
                  <span style={{
                    fontSize: 11, color: "var(--text-3)",
                    background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 20,
                    border: "1px solid var(--border)",
                  }}>
                    {merchant.businessType}
                  </span>
                  {merchant.existingDecision && (
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      background: "rgba(34,197,94,0.1)", color: "var(--green)",
                      padding: "2px 8px", borderRadius: 20,
                    }}>
                      Tier {merchant.existingDecision.tier}
                    </span>
                  )}
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>
                  {merchant.businessName}
                </h1>
                <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                  {merchant.ageInDays} days active · {merchant.orders.total} total orders
                </div>
              </div>

              <button
                className="btn-primary"
                onClick={handleRun}
                disabled={isRunning}
                style={{ flexShrink: 0, width: "auto", alignSelf: "flex-start" }}
              >
                <Zap size={14} /> Run new underwriting
              </button>
            </div>

            {error && (
              <div className="alert-error" style={{ marginTop: 12 }}>{error}</div>
            )}
          </div>

          {/* ── Two-column: snapshot + existing score ─────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, marginBottom: 28 }}>
            <div>
              <div className="form-section-label" style={{ marginBottom: 10 }}>Financial snapshot</div>
              <MerchantSnapshot merchant={merchant} />
            </div>

            <div>
              <div className="form-section-label" style={{ marginBottom: 10 }}>Score on record</div>
              {merchant.existingDecision ? (
                <div className="form-card" style={{ padding: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["Score", merchant.existingDecision.score],
                      ["Tier", merchant.existingDecision.tier],
                      ["Offer", fmt(merchant.existingDecision.offerAmountNaira)],
                      ["Confidence", merchant.existingDecision.confidence],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
                    As of {merchant.existingDecision.asOfDate}
                  </div>
                </div>
              ) : (
                <div className="form-card" style={{ padding: "16px", color: "var(--text-3)", fontSize: 13 }}>
                  No existing score — run underwriting to generate one.
                </div>
              )}

              {latest && (
                <div style={{ marginTop: 16 }}>
                  <div className="form-section-label" style={{ marginBottom: 10 }}>Latest decision</div>
                  <div className="form-card" style={{ padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                        color: DECISION_COLOR[latest.decision] ?? "var(--text-2)",
                      }}>
                        {latest.decision}
                      </span>
                      {latest.approvedAmountNaira != null && latest.approvedAmountNaira > 0 && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
                          {fmt(latest.approvedAmountNaira)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 10 }}>
                      {fmtDate(latest.createdAt)} at {fmtTime(latest.createdAt)}
                      {latest.executionTime && ` · ${latest.executionTime}`}
                    </div>
                    <Link
                      to={`/merchants/${merchantId}/decisions/${latest.requestId}`}
                      style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      View full report <ExternalLink size={11} />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Decision history table ────────────────────────────────────── */}
          <div>
            <div className="form-section-label" style={{ marginBottom: 12 }}>
              Decision history ({summaries.length})
            </div>

            {summaries.length === 0 ? (
              <div className="form-card" style={{ padding: "24px", color: "var(--text-3)", fontSize: 13, textAlign: "center" }}>
                No decisions yet — run underwriting to create the first one.
              </div>
            ) : (
              <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                      {["Date", "Decision", "Amount", "Duration", ""].map((h) => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left",
                          fontSize: 11, fontWeight: 600, color: "var(--text-3)",
                          letterSpacing: "0.05em", textTransform: "uppercase",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((s, i) => (
                      <tr
                        key={s.requestId}
                        style={{
                          borderBottom: i < summaries.length - 1 ? "1px solid var(--border)" : "none",
                          background: i % 2 === 0 ? "var(--surface)" : "transparent",
                        }}
                      >
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "var(--text-2)" }}>
                          {fmtDate(s.createdAt)}<br />
                          <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtTime(s.createdAt)}</span>
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700, textTransform: "capitalize",
                            color: DECISION_COLOR[s.decision] ?? "var(--text-2)",
                          }}>
                            {s.decision}
                          </span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "var(--text-1)" }}>
                          {s.approvedAmountNaira && s.approvedAmountNaira > 0 ? fmt(s.approvedAmountNaira) : "—"}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--text-3)" }}>
                          {s.executionTime ?? "—"}
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                          <Link
                            to={`/merchants/${merchantId}/decisions/${s.requestId}`}
                            style={{
                              fontSize: 12, color: "var(--primary)", textDecoration: "none",
                              display: "inline-flex", alignItems: "center", gap: 4,
                            }}
                          >
                            View <ExternalLink size={11} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Back to merchant list ─────────────────────────────────────── */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
            <Link to="/" style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none" }}>
              ← All merchants
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
