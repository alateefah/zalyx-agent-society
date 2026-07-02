import { useState, useCallback } from "react";
import {
  ShieldCheck, TrendingUp, AlertTriangle, Landmark, UserCheck,
  CheckCircle2, XCircle, Clock, Download, ArrowLeft,
  TriangleAlert, CircleCheck, Scale, GitCompare, Activity,
  Swords, Info,
} from "lucide-react";
import { ChevronDown } from "lucide-react";
import { AgentCard } from "./AgentCard";
import { fmt } from "../../utils/format";
import type { UnderwritingReport, BaselineReport } from "../../types";

interface Props {
  report: UnderwritingReport;
  baseline: BaselineReport | null;
  isMock: boolean | null;
  merchantId: string;
  onBack: () => void;
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="score-bar-track">
      <div
        className="score-bar-fill"
        style={{ width: `${Math.min(100, score)}%`, background: color }}
      />
    </div>
  );
}

export function ReportView({ report, baseline, isMock, merchantId, onBack }: Props) {
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [deltaOpen, setDeltaOpen]   = useState(false);
  const [obsOpen, setObsOpen]       = useState(false);

  const toggleLedger = useCallback(() => setLedgerOpen((v) => !v), []);
  const toggleDelta  = useCallback(() => setDeltaOpen((v) => !v),  []);
  const toggleObs    = useCallback(() => setObsOpen((v) => !v),    []);

  const decision = report.humanReview.finalRecommendation;
  const decisionColor = decision === "approved" ? "green" : decision === "rejected" ? "red" : "amber";
  const DecisionIcon  = decision === "approved" ? CheckCircle2 : decision === "rejected" ? XCircle : Clock;
  const decisionLabel = decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Requires clarification";
  const offerRange = report.financingStructure.offerRange ?? report.humanReview.approvedRange;

  const riskColor =
    report.riskAssessment.overallRiskScore > 60
      ? "#b91c1c"
      : report.riskAssessment.overallRiskScore > 35
      ? "#b45309"
      : "#15803d";

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `underwriting-${report.merchantId}.json`;
    a.click();
  };

  return (
    <div className="report-container">

      {/* Comparison strip */}
      {baseline && (
        <div className="comparison-strip">
          <div className="comparison-strip-header">
            <Info size={13} color="var(--text-3)" />
            <span className="comparison-strip-title">Track 2 — single-agent baseline vs. multi-agent debate</span>
            <span className="comparison-strip-sub">same data, same merchant</span>
          </div>
          <div className="comparison-grid">
            <div className="comp-card baseline">
              <div className="comp-label">Single agent</div>
              <div className={`comp-decision ${baseline.decision === "approved" ? "green" : baseline.decision === "rejected" ? "red" : "amber"}`}>
                {baseline.decision === "approved" ? "Approved" : baseline.decision === "rejected" ? "Rejected" : "Requires clarification"}
              </div>
              <div className="comp-amount">{baseline.proposedAmount}</div>
              <div className="comp-meta">1 LLM call · {baseline.executionTime} · {baseline.confidence}% confidence</div>
              <div className="comp-note">{baseline.reasoning.substring(0, 180)}…</div>
            </div>
            <div className="comp-vs">
              <div className="comp-vs-pill">VS</div>
              <div className="comp-vs-sub">debate<br />caught more</div>
            </div>
            <div className="comp-card multi">
              <div className="comp-label">5-agent debate</div>
              <div className={`comp-decision ${decisionColor}`}>{decisionLabel}</div>
              <div className="comp-amount">{report.humanReview.approvalAmount}</div>
              <div className="comp-meta">{report.debateTranscript.length} agent inputs · {report.executionTime}</div>
              <div className="comp-note">{report.humanReview.agentDebateNotes}</div>
            </div>
          </div>
        </div>
      )}

      {/* Decision banner */}
      <div className={`decision-row ${decisionColor}`}>
        <DecisionIcon size={28} className={`decision-icon ${decisionColor}`} />
        <div className="decision-main">
          <div className="decision-label">{decisionLabel}</div>
          <div className="decision-sub">
            {merchantId} · {report.executionTime} · {report.debateTranscript.length} agent inputs
            {isMock && <span className="mock-badge"> · mock mode</span>}
          </div>
        </div>
        <div className="decision-amount">{report.humanReview.approvalAmount}</div>
      </div>

      <div className="report-grid">

        {/* Left: scores */}
        <div className="scores-column">

          {/* Data Quality */}
          <div className="score-card">
            <div className="score-card-header">
              <div className="score-card-title"><ShieldCheck size={14} color="#2563eb" /> Data Quality</div>
              <div className="score-num">{report.dataQuality.overallScore.toFixed(0)}<span>/100</span></div>
            </div>
            <ScoreBar score={report.dataQuality.overallScore} color="#2563eb" />
            <div className="score-rows">
              <div className="score-row"><span className="score-row-label">Completeness</span><span className="score-row-value">{report.dataQuality.completeness.toFixed(0)}%</span></div>
              <div className="score-row"><span className="score-row-label">Consistency</span><span className="score-row-value">{report.dataQuality.consistency.toFixed(0)}%</span></div>
            </div>
            {report.dataQuality.anomalies.length > 0 && (
              <div className="flag-list">
                {report.dataQuality.anomalies.map((a, i) => (
                  <div key={i} className="flag-item"><TriangleAlert size={11} />{a}</div>
                ))}
              </div>
            )}
          </div>

          {/* Business Health */}
          <div className="score-card">
            <div className="score-card-header">
              <div className="score-card-title"><TrendingUp size={14} color="#15803d" /> Business Health</div>
              <div className="score-num">{report.businessAnalysis.businessHealthScore.toFixed(0)}<span>/100</span></div>
            </div>
            <ScoreBar score={report.businessAnalysis.businessHealthScore} color="#15803d" />
            <div className="score-rows">
              <div className="score-row"><span className="score-row-label">Avg monthly revenue</span><span className="score-row-value">{fmt(report.businessAnalysis.monthlyRevenueAverage)}</span></div>
              <div className="score-row"><span className="score-row-label">Revenue stability</span><span className="score-row-value">{report.businessAnalysis.revenueStability.toFixed(0)}/100</span></div>
              <div className="score-row"><span className="score-row-label">Profitability</span><span className="score-row-value">{report.businessAnalysis.profitabilityIndicator}</span></div>
            </div>
          </div>

          {/* Risk */}
          <div className="score-card">
            <div className="score-card-header">
              <div className="score-card-title"><AlertTriangle size={14} color="#b45309" /> Risk Score</div>
              <div className="score-num">{report.riskAssessment.overallRiskScore.toFixed(0)}<span>/100</span></div>
            </div>
            <ScoreBar score={report.riskAssessment.overallRiskScore} color={riskColor} />
            <div className="score-rows">
              <div className="score-row"><span className="score-row-label">Volatility index</span><span className="score-row-value">{report.riskAssessment.volatilityIndex.toFixed(0)}/100</span></div>
              <div className="score-row"><span className="score-row-label">Concentration</span><span className="score-row-value">{report.riskAssessment.concentrationRisk}</span></div>
              <div className="score-row"><span className="score-row-label">Op. stability</span><span className="score-row-value">{report.riskAssessment.operationalStability.toFixed(0)}/100</span></div>
            </div>
            {report.riskAssessment.riskFactors.length > 0 && (
              <div className="flag-list">
                {report.riskAssessment.riskFactors.map((f, i) => (
                  <div key={i} className="flag-item"><TriangleAlert size={11} />{f}</div>
                ))}
              </div>
            )}
          </div>

          {/* Financing terms — approved only */}
          {decision === "approved" && (
            <div className="score-card">
              <div className="score-card-header">
                <div className="score-card-title"><Landmark size={14} color="#475569" /> Financing terms</div>
              </div>
              <div className="terms-list">
                <div className="term-row"><span className="term-label">Investment range</span><span className="term-value">{report.financingStructure.proposedAmount}</span></div>
                {offerRange && (
                  <>
                    <div className="term-row"><span className="term-label">Maximum exposure</span><span className="term-value">{fmt(offerRange.maxCostPriceNaira)}</span></div>
                    <div className="term-row"><span className="term-label">Customer choice</span><span className="term-value">Any amount from {fmt(offerRange.minCostPriceNaira)} to {fmt(offerRange.maxCostPriceNaira)}</span></div>
                    <div className="term-row"><span className="term-label">Sale price range</span><span className="term-value">{fmt(offerRange.minSalePriceNaira)}–{fmt(offerRange.maxSalePriceNaira)}</span></div>
                    <div className="term-row"><span className="term-label">Profit margin</span><span className="term-value">{offerRange.profitMarginPct.toFixed(0)}% fixed Murabaha margin</span></div>
                    {offerRange.reviewPeriod && (
                      <div className="term-row"><span className="term-label">Review period</span><span className="term-value">{offerRange.reviewPeriod} · monthly offer</span></div>
                    )}
                    {offerRange.validUntil && (
                      <div className="term-row"><span className="term-label">Valid until</span><span className="term-value">{offerRange.validUntil}</span></div>
                    )}
                  </>
                )}
                <div className="term-row"><span className="term-label">Murabaha terms</span><span className="term-value">{report.financingStructure.repaymentTerms}</span></div>
                <div className="term-row"><span className="term-label">Installments</span><span className="term-value">{report.financingStructure.paymentSchedule}</span></div>
              </div>
              {report.financingStructure.riskMitigation.length > 0 && (
                <div className="conditions-list">
                  {report.financingStructure.riskMitigation.map((m, i) => (
                    <div key={i} className="condition-item"><CircleCheck size={11} />{m}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Human Review */}
          <div className="score-card">
            <div className="score-card-header">
              <div className="score-card-title"><UserCheck size={14} color="#64748b" /> Human review</div>
            </div>
            <div className="score-rows">
              <div className="score-row">
                <span className="score-row-label">Debate notes</span>
                <span className="score-row-value" style={{ textAlign: "right", fontSize: 12 }}>{report.humanReview.agentDebateNotes}</span>
              </div>
              {report.humanReview.termsAdjustments && (
                <div className="score-row">
                  <span className="score-row-label">Adjustments</span>
                  <span className="score-row-value" style={{ textAlign: "right", fontSize: 12 }}>{report.humanReview.termsAdjustments}</span>
                </div>
              )}
            </div>
          </div>

          {/* Debate Ledger */}
          {report.debateLedger && (
            <div className="score-card">
              <div className="score-card-header" onClick={toggleLedger} style={{ cursor: "pointer", userSelect: "none" }}>
                <div className="score-card-title"><Scale size={14} color="#b45309" /> Debate ledger</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {report.debateLedger.resolvedClaims}/{report.debateLedger.totalClaims} resolved ·{" "}
                    <span style={{ color: "#15803d" }}>{report.debateLedger.claimsConcededByRisk} conceded</span>
                    {report.debateLedger.claimsUphelByRisk > 0 && (
                      <span style={{ color: "#b91c1c" }}> · {report.debateLedger.claimsUphelByRisk} upheld</span>
                    )}
                  </span>
                  <ChevronDown size={12} color="var(--text-muted)" style={{ transform: ledgerOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </div>
              </div>
              {ledgerOpen && (
                <>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, margin: "8px 0" }}>
                    {report.debateLedger.negotiationSummary}
                  </div>
                  {report.debateLedger.claims.map((c) => {
                    const claimColor =
                      c.resolution === "claim_withdrawn" || c.resolution === "reframed_as_sector_normal"
                        ? "#15803d"
                        : c.resolution === "risk_concern_upheld"
                        ? "#b91c1c"
                        : c.resolution === "compromise_condition_set"
                        ? "#b45309"
                        : "var(--border)";
                    return (
                      <div key={c.claimId} style={{ marginTop: 6, padding: "7px 10px", borderRadius: 6, background: "var(--surface-raised)", borderLeft: `3px solid ${claimColor}` }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2 }}>
                          {c.claimId.toUpperCase()} · <span style={{ color: claimColor }}>{c.resolution.replace(/_/g, " ")}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 3 }}>{c.claim}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.impact}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* Decision Delta */}
          {report.decisionDelta && (
            <div className="score-card">
              <div className="score-card-header" onClick={toggleDelta} style={{ cursor: "pointer", userSelect: "none" }}>
                <div className="score-card-title"><GitCompare size={14} color="#2563eb" /> Decision delta</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <span style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 99,
                    background: report.decisionDelta.decisionChanged ? "rgba(37,99,235,0.1)" : "rgba(21,128,61,0.1)",
                    color: report.decisionDelta.decisionChanged ? "#2563eb" : "#15803d",
                  }}>
                    {report.decisionDelta.baselineDecision} → {report.decisionDelta.multiAgentDecision}
                  </span>
                  <ChevronDown size={12} color="var(--text-muted)" style={{ transform: deltaOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </div>
              </div>
              {deltaOpen && (
                <>
                  <div className="score-rows" style={{ margin: "8px 0" }}>
                    <div className="score-row"><span className="score-row-label">Baseline time</span><span className="score-row-value">{report.decisionDelta.baselineExecutionTime}</span></div>
                    <div className="score-row"><span className="score-row-label">Multi-agent time</span><span className="score-row-value">{report.decisionDelta.multiAgentExecutionTime}</span></div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>{report.decisionDelta.reason}</div>
                  {report.decisionDelta.valueAdded.length > 0 && (
                    <div className="conditions-list" style={{ marginTop: 10 }}>
                      {report.decisionDelta.valueAdded.map((item, i) => (
                        <div key={i} className="condition-item"><CircleCheck size={11} />{item}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Observability */}
          {report.observability && (
            <div className="score-card">
              <div className="score-card-header" onClick={toggleObs} style={{ cursor: "pointer", userSelect: "none" }}>
                <div className="score-card-title"><Activity size={14} color="#0f766e" /> Observability</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {report.observability.totalQwenCalls}q · {report.observability.totalMcpCalls}m · {report.observability.agentTimings.length} stages
                    {report.observability.mockMode && <span style={{ color: "#b45309" }}> · mock</span>}
                  </span>
                  <ChevronDown size={12} color="var(--text-muted)" style={{ transform: obsOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </div>
              </div>
              {obsOpen && (
                <>
                  <div className="score-rows" style={{ margin: "8px 0" }}>
                    <div className="score-row"><span className="score-row-label">Request ID</span><span className="score-row-value" style={{ fontSize: 10, fontFamily: "monospace" }}>{report.observability.requestId.slice(0, 20)}…</span></div>
                    <div className="score-row"><span className="score-row-label">Model</span><span className="score-row-value">{report.observability.model}</span></div>
                    <div className="score-row"><span className="score-row-label">Debate round</span><span className="score-row-value" style={{ color: report.observability.debateRoundFired ? "#15803d" : "var(--text-muted)" }}>{report.observability.debateRoundFired ? "fired" : "skipped"}</span></div>
                  </div>
                  <div>
                    {report.observability.agentTimings.map((t) => (
                      <div key={t.agentName} style={{ display: "flex", fontSize: 11, color: "var(--text-muted)", padding: "2px 0", borderBottom: "1px solid var(--border)", gap: 6 }}>
                        <span style={{ flex: 1 }}>{t.agentName}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{t.durationMs}ms</span>
                        <span style={{ color: "#0f766e" }}>{t.qwenCallCount}q</span>
                        <span style={{ color: "#64748b" }}>{t.mcpCallCount}m</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: debate transcript */}
        <div className="debate-column">
          <div className="debate-col-header">
            <div className="debate-col-title">Agent debate transcript</div>
            <div className="debate-col-sub">Click any card to read full reasoning</div>
          </div>
          <div className="debate-list">
            {report.debateTranscript.map((msg, i) => {
              const isRound2Start =
                msg.round === 2 && (i === 0 || (report.debateTranscript[i - 1].round ?? 1) < 2);
              return (
                <div key={i}>
                  {isRound2Start && (
                    <div className="round-divider"><Swords size={12} /> Debate Round 2</div>
                  )}
                  <AgentCard msg={msg} index={i} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="report-footer">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={13} /> Back to merchant</button>
        <button className="btn-ghost" onClick={exportJson}><Download size={13} /> Export JSON</button>
      </div>
    </div>
  );
}
