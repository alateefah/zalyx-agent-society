import { useState, useEffect } from "react";
import {
  ShieldCheck, TrendingUp, AlertTriangle,
  Landmark, UserCheck, ChevronDown, ArrowLeft,
  Download, CheckCircle2, XCircle, Clock,
  School, ShoppingBag, Briefcase, Zap, Swords,
  TriangleAlert, CircleCheck, Info, Scale, GitCompare, Activity,
} from "lucide-react";

// ── Zalyx brand logo — uses extracted icon from official brand guide ──────────
function ZalyxLogo({ height = 32 }: { height?: number }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <img src="/zalyx-logo.png" height={height} style={{ display: "block", width: "auto" }} alt="Zalyx logo" />
      {/* <img src="/zalyx-icon.png" height={height} style={{ display: "block", width: "auto" }} alt="Zalyx icon" />
      <span style={{
        fontSize: height * 0.6,
        fontWeight: 700,
        letterSpacing: "-0.025em",
        background: "linear-gradient(135deg, #26C7C3 0%, #8354AA 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        Zalyx
      </span> */}
    </span>
  );
}
import "./App.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DataQualityResult {
  completeness: number; consistency: number;
  anomalies: string[]; overallScore: number;
}
interface BusinessAnalysisResult {
  monthlyRevenueAverage: number; revenueStability: number;
  transactionFrequency: number; profitabilityIndicator: string;
  businessHealthScore: number; recommendation: string;
}
interface RiskAssessmentResult {
  volatilityIndex: number; concentrationRisk: string;
  operationalStability: number; riskFactors: string[];
  overallRiskScore: number; recommendation: string;
}
interface FinancingStructureResult {
  proposedAmount: string; repaymentTerms: string;
  paymentSchedule: string; riskMitigation: string[]; rationale: string;
}
interface HumanReviewResult {
  finalRecommendation: "approved" | "rejected" | "requires-clarification";
  approvalAmount: string; termsAdjustments: string;
  agentDebateNotes: string; reason: string;
}
interface AgentDebateMessage {
  agentName: string; agentRole: string; timestamp: string; message: string;
  recommendation?: string; confidence?: number;
  messageType?: "position" | "challenge" | "rebuttal" | "verdict" | "summary";
  round?: number;
}
interface DebateClaim {
  claimId: string; claim: string;
  raisedBy: string; challengedAgent: string;
  evidenceFor: string[]; evidenceAgainst: string[];
  resolution: "reframed_as_sector_normal" | "risk_concern_upheld" | "claim_withdrawn" | "compromise_condition_set" | "unresolved";
  impact: string;
}
interface DebateLedger {
  totalClaims: number; resolvedClaims: number;
  claimsUphelByRisk: number; claimsConcededByRisk: number;
  claims: DebateClaim[]; negotiationSummary: string;
}
interface DecisionDelta {
  baselineDecision: "approved" | "rejected" | "requires-clarification";
  multiAgentDecision: "approved" | "rejected" | "requires-clarification";
  deltaType: "same_decision" | "multi_more_conservative" | "multi_more_permissive";
  decisionChanged: boolean; reason: string;
  valueAdded: string[]; structuredOutputAdvantage: string;
  baselineExecutionTime: string; multiAgentExecutionTime: string;
}
interface AgentTiming {
  agentName: string; durationMs: number; qwenCallCount: number; mcpCallCount: number;
}
interface RunObservability {
  requestId: string; mockMode: boolean; model: string;
  totalQwenCalls: number; totalMcpCalls: number;
  agentTimings: AgentTiming[];
  parallelStages: string[]; debateRoundFired: boolean; stage4Skipped: boolean;
}
interface UnderwritingReport {
  merchantId: string; executionTime: string;
  dataQuality: DataQualityResult; businessAnalysis: BusinessAnalysisResult;
  riskAssessment: RiskAssessmentResult; financingStructure: FinancingStructureResult;
  humanReview: HumanReviewResult; debateTranscript: AgentDebateMessage[];
  debateLedger?: DebateLedger;
  decisionDelta?: DecisionDelta;
  observability: RunObservability;
}
interface BaselineReport {
  merchantId: string; executionTime: string;
  decision: "approved" | "rejected" | "requires-clarification";
  reasoning: string; proposedAmount: string;
  riskSummary: string; confidence: number;
}
interface MonthlyRevenueBucket {
  month: string; revenueNaira: number; orderCount: number; uniqueCustomers: number;
}
interface ZalyxMerchantSnapshot {
  id: string; businessName: string; businessType: string; ageInDays: number;
  orders: { total: number; completed: number; cancelled: number; outstanding: number };
  receivables: { outstandingOrders: number; totalOwedNaira: number; totalCollectedNaira: number; uncollectedNaira: number };
  monthlyRevenue: MonthlyRevenueBucket[];
  signals: {
    period30d: { activeDays: number; totalOrders: number; avgDailyRevenueNaira: number; editRate: number; deleteRate: number; backdateRate: number; batchDays: number };
    period90d: { activeDays: number; totalOrders: number; avgDailyRevenueNaira: number };
  };
  existingDecision?: { score: number; tier: string; eligible: boolean; offerAmountNaira: number; fixedFeeNaira: number; tenorMonths: number; confidence: string; asOfDate: string };
}
type AgentProgressEvent =
  | { type: "stage_start";    stage: number | string; agentName: string }
  | { type: "stage_complete"; stage: number | string; agentName: string; debateMessage: AgentDebateMessage }
  | { type: "debate_start" }
  | { type: "done";   report: UnderwritingReport }
  | { type: "error";  message: string };

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_MERCHANTS: Record<string, ZalyxMerchantSnapshot> = {
  school: {
    id: "ZALYX-001", businessName: "ZALYX-001 (School)", businessType: "School", ageInDays: 58,
    orders: { total: 41, completed: 24, cancelled: 0, outstanding: 17 },
    receivables: { outstandingOrders: 17, totalOwedNaira: 2545000, totalCollectedNaira: 1481000, uncollectedNaira: 1064000 },
    monthlyRevenue: [
      { month: "2026-04", revenueNaira: 307000,  orderCount: 6,  uniqueCustomers: 6  },
      { month: "2026-05", revenueNaira: 2653000, orderCount: 23, uniqueCustomers: 20 },
      { month: "2026-06", revenueNaira: 1338000, orderCount: 17, uniqueCustomers: 17 },
    ],
    signals: {
      period30d: { activeDays: 7, totalOrders: 23, avgDailyRevenueNaira: 61000, editRate: 0, deleteRate: 0, backdateRate: 0, batchDays: 0 },
      period90d: { activeDays: 17, totalOrders: 47, avgDailyRevenueNaira: 47755 },
    },
    existingDecision: { score: 75, tier: "B", eligible: true, offerAmountNaira: 250000, fixedFeeNaira: 25000, tenorMonths: 3, confidence: "MED", asOfDate: "2026-06-07" },
  },
  naturals: {
    id: "ZALYX-002", businessName: "ZALYX-002 (Natural Products)", businessType: "Natural Skin & Hair Products", ageInDays: 71,
    orders: { total: 31, completed: 29, cancelled: 1, outstanding: 1 },
    receivables: { outstandingOrders: 1, totalOwedNaira: 6000, totalCollectedNaira: 5000, uncollectedNaira: 1000 },
    monthlyRevenue: [
      { month: "2026-04", revenueNaira: 151100, orderCount: 16, uniqueCustomers: 13 },
      { month: "2026-05", revenueNaira: 42700,  orderCount: 7,  uniqueCustomers: 6  },
      { month: "2026-06", revenueNaira: 58500,  orderCount: 8,  uniqueCustomers: 7  },
    ],
    signals: {
      period30d: { activeDays: 2, totalOrders: 8, avgDailyRevenueNaira: 1950, editRate: 0, deleteRate: 0, backdateRate: 0, batchDays: 0 },
      period90d: { activeDays: 12, totalOrders: 33, avgDailyRevenueNaira: 2803 },
    },
  },
  freelancer: {
    id: "ZALYX-003", businessName: "ZALYX-003 (Freelancer)", businessType: "Freelancer", ageInDays: 39,
    orders: { total: 8, completed: 2, cancelled: 0, outstanding: 6 },
    receivables: { outstandingOrders: 6, totalOwedNaira: 1425000, totalCollectedNaira: 850000, uncollectedNaira: 575000 },
    monthlyRevenue: [
      { month: "2026-05", revenueNaira: 1105000, orderCount: 8, uniqueCustomers: 8 },
    ],
    signals: {
      period30d: { activeDays: 0, totalOrders: 0, avgDailyRevenueNaira: 0, editRate: 0, deleteRate: 0, backdateRate: 0, batchDays: 0 },
      period90d: { activeDays: 6, totalOrders: 8, avgDailyRevenueNaira: 12278 },
    },
  },
};

const fmt = (n: number) => `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

// ── Agent config ──────────────────────────────────────────────────────────────

const AGENT_META: Record<string, { color: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  "Data Quality Agent":        { color: "#6366f1", Icon: ShieldCheck },
  "Business Analysis Agent":   { color: "#22c55e", Icon: TrendingUp },
  "Risk Assessment Agent":     { color: "#f59e0b", Icon: AlertTriangle },
  "Financing Structure Agent": { color: "#3b82f6", Icon: Landmark },
  "Human Review Agent":        { color: "#a78bfa", Icon: UserCheck },
};

const MSG_TYPE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  position:  { label: "Position",  color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  challenge: { label: "Challenge", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  rebuttal:  { label: "Rebuttal",  color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
  verdict:   { label: "Verdict",   color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  summary:   { label: "Summary",   color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${Math.min(100, score)}%`, background: color }} />
    </div>
  );
}

function AgentCard({ msg, index }: { msg: AgentDebateMessage; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = AGENT_META[msg.agentName] ?? { color: "#64748b", Icon: UserCheck };
  const typeMeta = msg.messageType ? MSG_TYPE_STYLE[msg.messageType] : null;
  const { Icon } = meta;

  return (
    <div className="agent-card" style={{ borderLeftColor: meta.color }}>
      <div className="agent-card-header" onClick={() => setOpen(!open)}>
        <div className="agent-card-left">
          <div className="agent-num" style={{ background: meta.color }}>{index + 1}</div>
          <div className="agent-icon-wrap"><Icon size={14} /></div>
          <div className="agent-card-info">
            <div className="agent-card-name">
              {msg.agentName}
              {typeMeta && (
                <span className="msg-type-tag" style={{ background: typeMeta.bg, color: typeMeta.color }}>
                  {typeMeta.label}
                </span>
              )}
            </div>
            <div className="agent-card-role">{msg.agentRole}</div>
          </div>
        </div>
        <div className="agent-card-right">
          {msg.confidence !== undefined && (
            <span className="confidence-tag" style={{ color: meta.color }}>{msg.confidence.toFixed(0)}%</span>
          )}
          {msg.recommendation && (
            <span className="rec-tag">{msg.recommendation}</span>
          )}
          <ChevronDown size={14} className={`chevron${open ? " open" : ""}`} />
        </div>
      </div>
      {open && (
        <div className="agent-card-body">
          <p className="agent-card-message">{msg.message}</p>
          <div className="agent-card-ts">{new Date(msg.timestamp).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView]           = useState<"form" | "processing" | "report">("form");
  const [selectedDemo, setDemo]   = useState<"school" | "naturals" | "freelancer">("school");
  const [formMode, setFormMode]   = useState<"demo" | "custom">("demo");
  const [customJson, setJson]     = useState("");
  const [jsonError, setJsonError] = useState("");
  const [merchantData, setMerchant] = useState<ZalyxMerchantSnapshot>(DEMO_MERCHANTS.school);
  const [report, setReport]       = useState<UnderwritingReport | null>(null);
  const [baseline, setBaseline]   = useState<BaselineReport | null>(null);
  const [error, setError]         = useState("");
  const [processingLabel, setPLabel] = useState("Starting…");
  const [liveMessages, setLive]   = useState<AgentDebateMessage[]>([]);
  const [isMock, setMock]         = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(h => setMock(h.mockMode)).catch(() => {});
  }, []);

  const handleDemoSelect = (key: "school" | "naturals" | "freelancer") => {
    setDemo(key);
    setMerchant(DEMO_MERCHANTS[key]);
  };

  const handleJson = (val: string) => {
    setJson(val); setJsonError("");
    try { if (val.trim()) setMerchant(JSON.parse(val)); }
    catch { setJsonError("Invalid JSON"); }
  };

  const handleSubmit = async () => {
    setError(""); setBaseline(null); setReport(null);
    setLive([]); setPLabel("Starting agents…"); setView("processing");
    try {
      const hr = await fetch("/api/health");
      if (hr.ok) { const h = await hr.json(); setMock(h.mockMode); }

      const baselineP = fetch("/api/baseline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merchantData),
      });

      const res = await fetch("/api/underwrite/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merchantData),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Underwriting failed");

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "", finalReport: UnderwritingReport | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const evt: AgentProgressEvent = JSON.parse(line.slice(6));
          if (evt.type === "stage_start")    setPLabel(`${evt.agentName}…`);
          else if (evt.type === "stage_complete") { setLive(p => [...p, evt.debateMessage]); setPLabel(`${evt.agentName} done`); }
          else if (evt.type === "debate_start")   setPLabel("Debate round 2…");
          else if (evt.type === "done")   finalReport = evt.report;
          else if (evt.type === "error")  throw new Error(evt.message);
        }
      }
      const br = await baselineP;
      const bd: BaselineReport | null = br.ok ? await br.json() : null;
      if (!finalReport) throw new Error("No report received");
      setReport(finalReport); setBaseline(bd); setView("report");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Is the backend running?";
      setError(msg);
      setView("form");
    }
  };

  const reset = () => { setView("form"); setReport(null); setBaseline(null); };

  // ── Decision helpers ────────────────────────────────────────────────────────
  const decision = report?.humanReview.finalRecommendation;
  const decisionColor = decision === "approved" ? "green" : decision === "rejected" ? "red" : "amber";
  const DecisionIcon = decision === "approved" ? CheckCircle2 : decision === "rejected" ? XCircle : Clock;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* Header */}
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <ZalyxLogo height={26} />
            <div className="logo-divider" />
            <span className="logo-sub">Underwriting</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isMock !== null && (
              <span className={`api-badge ${isMock ? "api-badge-mock" : "api-badge-live"}`}>
                <span className="api-badge-dot" />
                {isMock ? "Mock mode" : "Live AI"}
              </span>
            )}
            {view === "report" && (
              <button className="btn-secondary" onClick={reset}>
                <ArrowLeft size={13} /> New application
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">

        {/* ── FORM ─────────────────────────────────────────────────────────── */}
        {view === "form" && (
          <div className="form-container">
            <div className="page-title">New underwriting application</div>
            <div className="page-sub">Five agents debate every application — data quality, business health, risk, financing, and final review.</div>

            {/* Pipeline row */}
            <div className="pipeline-row">
              {[
                { n: 1, name: "Data Quality",   desc: "Validates completeness, flags anomalies",   Icon: ShieldCheck },
                { n: 2, name: "Business",        desc: "Revenue health & viability",                Icon: TrendingUp },
                { n: 3, name: "Risk",            desc: "Challenges assumptions, flags volatility",  Icon: AlertTriangle },
                { n: 4, name: "Financing",       desc: "Structures Murabaha-compliant offer",       Icon: Landmark },
                { n: 5, name: "Human Review",    desc: "Synthesises debate, issues final decision", Icon: UserCheck },
              ].map(({ n, name, desc, Icon }) => (
                <div className="pipeline-step" key={n}>
                  <div className="pipeline-step-num">{n}</div>
                  <Icon size={13} color="var(--primary)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div className="pipeline-step-label">
                    <div className="pipeline-step-name">{name}</div>
                    <div className="pipeline-step-desc">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="form-card">

              {/* Merchant selector */}
              <div className="form-section">
                <div className="form-section-label">Select merchant</div>
                <div className="tab-bar">
                  <button className={`tab${formMode === "demo" ? " active" : ""}`} onClick={() => setFormMode("demo")}>Demo merchants</button>
                  <button className={`tab${formMode === "custom" ? " active" : ""}`} onClick={() => setFormMode("custom")}>Custom JSON</button>
                </div>

                {formMode === "demo" && (
                  <>
                    <div className="demo-grid">
                      {([
                        { key: "school",     Icon: School,      riskLabel: "Low risk",      variant: "badge-green" },
                        { key: "naturals",   Icon: ShoppingBag, riskLabel: "Moderate risk", variant: "badge-yellow" },
                        { key: "freelancer", Icon: Briefcase,   riskLabel: "High risk",     variant: "badge-red" },
                      ] as const).map(({ key, Icon: CardIcon, riskLabel, variant }) => {
                        const m = DEMO_MERCHANTS[key];
                        return (
                          <div
                            key={key}
                            className={`demo-card${selectedDemo === key ? " selected" : ""}`}
                            onClick={() => handleDemoSelect(key)}
                          >
                            <div className="demo-card-header">
                              <div className="demo-icon"><CardIcon size={14} /></div>
                              <div>
                                <div className="demo-card-id">{m.id}</div>
                                <div className="demo-card-type">{m.businessType}</div>
                              </div>
                            </div>
                            <span className={`badge ${variant}`}>{riskLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {formMode === "custom" && (
                  <div>
                    <textarea
                      className={`json-input${jsonError ? " error" : ""}`}
                      rows={10}
                      placeholder='{ "id": "MERCHANT-001", "businessName": "...", ... }'
                      value={customJson}
                      onChange={e => handleJson(e.target.value)}
                    />
                    {jsonError && <div className="field-error">{jsonError}</div>}
                  </div>
                )}
              </div>

              {/* Preview */}
              <div className="form-section">
                <div className="form-section-label">Merchant snapshot</div>
                <div className="snapshot-grid">
                  <div className="snapshot-item"><span className="snapshot-label">Merchant ID</span><span className="snapshot-value">{merchantData.id}</span></div>
                  <div className="snapshot-item"><span className="snapshot-label">Business type</span><span className="snapshot-value">{merchantData.businessType}</span></div>
                  <div className="snapshot-item"><span className="snapshot-label">Platform age</span><span className="snapshot-value">{merchantData.ageInDays} days</span></div>
                  <div className="snapshot-item"><span className="snapshot-label">Total orders</span><span className="snapshot-value">{merchantData.orders.total} ({merchantData.orders.completed} completed)</span></div>
                  <div className="snapshot-item"><span className="snapshot-label">Uncollected receivables</span><span className="snapshot-value">{fmt(merchantData.receivables.uncollectedNaira)}</span></div>
                  <div className="snapshot-item"><span className="snapshot-label">Active days (30d)</span><span className="snapshot-value">{merchantData.signals.period30d.activeDays}</span></div>
                  {merchantData.existingDecision && (
                    <div className="snapshot-item"><span className="snapshot-label">Zalyx score</span><span className="snapshot-value">{merchantData.existingDecision.score}/100 · Tier {merchantData.existingDecision.tier}</span></div>
                  )}
                  <div className="snapshot-item"><span className="snapshot-label">Revenue months</span><span className="snapshot-value">{merchantData.monthlyRevenue.length}</span></div>
                </div>
              </div>

              {/* Submit */}
              <div className="form-section">
                {error && <div className="alert-error">{error}</div>}
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={formMode === "custom" && (!!jsonError || !customJson.trim())}
                >
                  <Zap size={15} /> Run underwriting
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PROCESSING ───────────────────────────────────────────────────── */}
        {view === "processing" && (
          <div className="processing-container">
            <div className="processing-header">
              <div className="spinner" />
              <div className="processing-info">
                <div className="processing-title">Agents running</div>
                <div className="processing-merchant">{merchantData.id}</div>
                <div className="processing-current">
                  {processingLabel}
                  {isMock && " · mock mode"}
                </div>
              </div>
            </div>

            {liveMessages.length > 0 && (
              <>
                <div className="live-transcript-label">Live transcript</div>
                <div className="debate-list">
                  {liveMessages.map((msg, i) => {
                    const isRound2Start = msg.round === 2 && (i === 0 || (liveMessages[i - 1].round ?? 1) < 2);
                    return (
                      <div key={i}>
                        {isRound2Start && (
                          <div className="round-divider"><Swords size={12} />Debate Round 2</div>
                        )}
                        <AgentCard msg={msg} index={i} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── REPORT ───────────────────────────────────────────────────────── */}
        {view === "report" && report && (
          <div className="report-container">

            {/* Comparison strip */}
            {baseline && (
              <div className="comparison-strip">
                <div className="comparison-strip-header">
                  <Info size={13} color="var(--text-3)" />
                  <span className="comparison-strip-title">Track 3 — single agent vs. multi-agent</span>
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
                    <div className="comp-vs-sub">debate<br/>caught more</div>
                  </div>
                  <div className="comp-card multi">
                    <div className="comp-label">5-agent debate</div>
                    <div className={`comp-decision ${decisionColor}`}>
                      {decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Requires clarification"}
                    </div>
                    <div className="comp-amount">{report.humanReview.approvalAmount}</div>
                    <div className="comp-meta">{report.debateTranscript.length} agent inputs · {report.executionTime}</div>
                    <div className="comp-note">{report.humanReview.agentDebateNotes}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Decision row */}
            <div className={`decision-row ${decisionColor}`}>
              <DecisionIcon size={28} className={`decision-icon ${decisionColor}`} />
              <div className="decision-main">
                <div className="decision-label">
                  {decision === "approved" ? "Approved" : decision === "rejected" ? "Rejected" : "Requires clarification"}
                </div>
                <div className="decision-sub">
                  {merchantData.id} · {report.executionTime} · {report.debateTranscript.length} agent inputs
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
                    <div className="score-card-title"><ShieldCheck size={14} color="#6366f1" /> Data Quality</div>
                    <div className="score-num">{report.dataQuality.overallScore.toFixed(0)}<span>/100</span></div>
                  </div>
                  <ScoreBar score={report.dataQuality.overallScore} color="#6366f1" />
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
                    <div className="score-card-title"><TrendingUp size={14} color="#22c55e" /> Business Health</div>
                    <div className="score-num">{report.businessAnalysis.businessHealthScore.toFixed(0)}<span>/100</span></div>
                  </div>
                  <ScoreBar score={report.businessAnalysis.businessHealthScore} color="#22c55e" />
                  <div className="score-rows">
                    <div className="score-row"><span className="score-row-label">Avg monthly revenue</span><span className="score-row-value">{fmt(report.businessAnalysis.monthlyRevenueAverage)}</span></div>
                    <div className="score-row"><span className="score-row-label">Revenue stability</span><span className="score-row-value">{report.businessAnalysis.revenueStability.toFixed(0)}/100</span></div>
                    <div className="score-row"><span className="score-row-label">Profitability</span><span className="score-row-value">{report.businessAnalysis.profitabilityIndicator}</span></div>
                  </div>
                </div>

                {/* Risk */}
                <div className="score-card">
                  <div className="score-card-header">
                    <div className="score-card-title"><AlertTriangle size={14} color="#f59e0b" /> Risk Score</div>
                    <div className="score-num">{report.riskAssessment.overallRiskScore.toFixed(0)}<span>/100</span></div>
                  </div>
                  <ScoreBar
                    score={report.riskAssessment.overallRiskScore}
                    color={report.riskAssessment.overallRiskScore > 60 ? "#ef4444" : report.riskAssessment.overallRiskScore > 35 ? "#f59e0b" : "#22c55e"}
                  />
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

                {/* Financing — only shown when approved */}
                {report.humanReview.finalRecommendation === "approved" && (
                <div className="score-card">
                  <div className="score-card-header">
                    <div className="score-card-title"><Landmark size={14} color="#3b82f6" /> Financing terms</div>
                  </div>
                  <div className="terms-list">
                    <div className="term-row"><span className="term-label">Cost price</span><span className="term-value">{report.financingStructure.proposedAmount}</span></div>
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
                    <div className="score-card-title"><UserCheck size={14} color="#a78bfa" /> Human review</div>
                  </div>
                  <div className="score-rows">
                    <div className="score-row"><span className="score-row-label">Debate notes</span><span className="score-row-value" style={{ textAlign: "right", fontSize: 11 }}>{report.humanReview.agentDebateNotes}</span></div>
                    {report.humanReview.termsAdjustments && (
                      <div className="score-row"><span className="score-row-label">Adjustments</span><span className="score-row-value" style={{ textAlign: "right", fontSize: 11 }}>{report.humanReview.termsAdjustments}</span></div>
                    )}
                  </div>
                </div>

                {/* Debate Ledger */}
                {report.debateLedger && (
                  <div className="score-card">
                    <div className="score-card-header">
                      <div className="score-card-title"><Scale size={14} color="#f59e0b" /> Debate ledger</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>
                        {report.debateLedger.resolvedClaims}/{report.debateLedger.totalClaims} claims resolved
                      </div>
                    </div>
                    <div className="score-rows" style={{ marginBottom: 8 }}>
                      <div className="score-row"><span className="score-row-label">Risk conceded</span><span className="score-row-value" style={{ color: "#22c55e" }}>{report.debateLedger.claimsConcededByRisk}</span></div>
                      <div className="score-row"><span className="score-row-label">Risk upheld</span><span className="score-row-value" style={{ color: "#ef4444" }}>{report.debateLedger.claimsUphelByRisk}</span></div>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 4 }}>
                      {report.debateLedger.negotiationSummary}
                    </div>
                    {report.debateLedger.claims.map((c) => (
                      <div key={c.claimId} style={{
                        marginTop: 8, padding: "8px 10px", borderRadius: 6,
                        background: "var(--surface-raised)",
                        borderLeft: `3px solid ${
                          c.resolution === "claim_withdrawn" || c.resolution === "reframed_as_sector_normal" ? "#22c55e"
                          : c.resolution === "risk_concern_upheld" ? "#ef4444"
                          : c.resolution === "compromise_condition_set" ? "#f59e0b"
                          : "var(--border)"
                        }`
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 3 }}>
                          {c.claimId.toUpperCase()} ·{" "}
                          <span style={{ color:
                            c.resolution === "claim_withdrawn" || c.resolution === "reframed_as_sector_normal" ? "#22c55e"
                            : c.resolution === "risk_concern_upheld" ? "#ef4444"
                            : "#f59e0b"
                          }}>
                            {c.resolution.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-primary)", marginBottom: 4 }}>{c.claim}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{c.impact}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Decision Delta */}
                {report.decisionDelta && (
                  <div className="score-card">
                    <div className="score-card-header">
                      <div className="score-card-title"><GitCompare size={14} color="#6366f1" /> Decision delta</div>
                      <div style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 99,
                        background: report.decisionDelta.decisionChanged ? "rgba(99,102,241,0.15)" : "rgba(34,197,94,0.15)",
                        color: report.decisionDelta.decisionChanged ? "#a5b4fc" : "#86efac",
                        marginLeft: "auto",
                      }}>
                        {report.decisionDelta.decisionChanged ? "decision changed" : "same decision"}
                      </div>
                    </div>
                    <div className="score-rows" style={{ marginBottom: 8 }}>
                      <div className="score-row">
                        <span className="score-row-label">Baseline</span>
                        <span className="score-row-value" style={{
                          color: report.decisionDelta.baselineDecision === "approved" ? "#22c55e" : report.decisionDelta.baselineDecision === "rejected" ? "#ef4444" : "#f59e0b"
                        }}>{report.decisionDelta.baselineDecision}</span>
                      </div>
                      <div className="score-row">
                        <span className="score-row-label">Multi-agent</span>
                        <span className="score-row-value" style={{
                          color: report.decisionDelta.multiAgentDecision === "approved" ? "#22c55e" : report.decisionDelta.multiAgentDecision === "rejected" ? "#ef4444" : "#f59e0b"
                        }}>{report.decisionDelta.multiAgentDecision}</span>
                      </div>
                      <div className="score-row"><span className="score-row-label">Baseline time</span><span className="score-row-value">{report.decisionDelta.baselineExecutionTime}</span></div>
                      <div className="score-row"><span className="score-row-label">Multi-agent time</span><span className="score-row-value">{report.decisionDelta.multiAgentExecutionTime}</span></div>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>{report.decisionDelta.reason}</div>
                  </div>
                )}

                {/* Observability */}
                {report.observability && (
                  <div className="score-card">
                    <div className="score-card-header">
                      <div className="score-card-title"><Activity size={14} color="#06b6d4" /> Observability</div>
                      {report.observability.mockMode && (
                        <div style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(245,158,11,0.15)", color: "#fcd34d", marginLeft: "auto" }}>mock mode</div>
                      )}
                    </div>
                    <div className="score-rows">
                      <div className="score-row"><span className="score-row-label">Request ID</span><span className="score-row-value" style={{ fontSize: 9, fontFamily: "monospace" }}>{report.observability.requestId.slice(0, 16)}…</span></div>
                      <div className="score-row"><span className="score-row-label">Model</span><span className="score-row-value">{report.observability.model}</span></div>
                      <div className="score-row"><span className="score-row-label">Qwen calls</span><span className="score-row-value">{report.observability.totalQwenCalls}</span></div>
                      <div className="score-row"><span className="score-row-label">MCP calls</span><span className="score-row-value">{report.observability.totalMcpCalls}</span></div>
                      <div className="score-row"><span className="score-row-label">Agent stages</span><span className="score-row-value">{report.observability.agentTimings.length}</span></div>
                      <div className="score-row"><span className="score-row-label">Debate round</span><span className="score-row-value" style={{ color: report.observability.debateRoundFired ? "#22c55e" : "var(--text-muted)" }}>{report.observability.debateRoundFired ? "fired" : "skipped"}</span></div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {report.observability.agentTimings.map((t) => (
                        <div key={t.agentName} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", padding: "2px 0", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ flex: 1 }}>{t.agentName}</span>
                          <span style={{ color: "var(--text-secondary)", minWidth: 50, textAlign: "right" }}>{t.durationMs}ms</span>
                          <span style={{ color: "#06b6d4", minWidth: 40, textAlign: "right" }}>{t.qwenCallCount}q</span>
                          <span style={{ color: "#a78bfa", minWidth: 40, textAlign: "right" }}>{t.mcpCallCount}m</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Right: transcript */}
              <div className="debate-column">
                <div className="debate-col-header">
                  <div className="debate-col-title">Agent debate transcript</div>
                  <div className="debate-col-sub">Click any card to read full reasoning</div>
                </div>
                <div className="debate-list">
                  {report.debateTranscript.map((msg, i) => {
                    const isRound2Start = msg.round === 2 && (i === 0 || (report.debateTranscript[i - 1].round ?? 1) < 2);
                    return (
                      <div key={i}>
                        {isRound2Start && (
                          <div className="round-divider"><Swords size={12} />Debate Round 2</div>
                        )}
                        <AgentCard msg={msg} index={i} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="report-footer">
              <button className="btn-secondary" onClick={reset}><ArrowLeft size={13} />New application</button>
              <button className="btn-ghost" onClick={() => {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                a.download = `underwriting-${report.merchantId}.json`; a.click();
              }}>
                <Download size={13} />Export JSON
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
