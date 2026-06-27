import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ChevronRight } from "lucide-react";

import { Header }         from "../components/layout/Header";
import { CustomJsonInput } from "../components/underwriting/CustomJsonInput";

import { useMerchants }  from "../hooks/useMerchants";
import { useIsMock }     from "../hooks/useIsMock";

import type { ZalyxMerchantSnapshot } from "../types";

export function MerchantsDashboard() {
  const navigate = useNavigate();
  const isMock = useIsMock();
  const { merchants, addMerchant } = useMerchants();

  const [search, setSearch] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customJson, setCustomJson] = useState("");
  const [customJsonError, setCustomJsonError] = useState("");
  const [pendingCustom, setPendingCustom] = useState<ZalyxMerchantSnapshot | null>(null);

  const filtered = merchants.filter(
    (m) =>
      m.businessName.toLowerCase().includes(search.toLowerCase()) ||
      m.businessType.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleCustomJsonChange = (raw: string, parsed: ZalyxMerchantSnapshot | null) => {
    setCustomJson(raw);
    setCustomJsonError(parsed === null && raw.trim() ? "Invalid JSON" : "");
    if (parsed) setPendingCustom(parsed);
  };

  const handleAddCustom = () => {
    if (!pendingCustom) return;
    addMerchant(pendingCustom);
    // Pass merchant via state — backend won't have it, MerchantWorkspace uses state as fallback
    navigate(`/merchants/${pendingCustom.id}`, { state: { merchant: pendingCustom } });
  };

  return (
    <div className="app">
      <Header isMock={isMock} breadcrumbs={[{ label: "Merchants" }]} />

      <main className="app-main">
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <div className="page-title">Merchant portfolio</div>
              <div className="page-sub" style={{ marginTop: 4 }}>
                {merchants.length} merchants · select one to view their workspace
              </div>
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowCustom((v) => !v)}
            >
              <Plus size={13} /> Custom merchant
            </button>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 20 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, type, or ID…"
              style={{
                width: "100%", padding: "9px 12px 9px 34px",
                background: "var(--surface-2, var(--surface))", border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)", color: "var(--text-1)", fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          {/* Custom merchant form */}
          {showCustom && (
            <div className="form-card" style={{ marginBottom: 24 }}>
              <div className="form-section-label" style={{ marginBottom: 10 }}>
                Paste merchant JSON snapshot
              </div>
              <CustomJsonInput
                value={customJson}
                error={customJsonError}
                onChange={handleCustomJsonChange}
              />
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={handleAddCustom}
                  disabled={!pendingCustom || !!customJsonError}
                >
                  Open workspace →
                </button>
                <button className="btn-secondary" onClick={() => setShowCustom(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Merchant list */}
          <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "24px 16px", color: "var(--text-3)", fontSize: 14 }}>
                No merchants match "{search}"
              </div>
            ) : (
              filtered.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/merchants/${m.id}`)}
                  style={{
                    display: "flex", alignItems: "center", width: "100%",
                    padding: "14px 16px", gap: 12,
                    background: i % 2 === 0 ? "var(--surface)" : "transparent",
                    border: "none",
                    borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                    cursor: "pointer", textAlign: "left", color: "inherit",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-1)" }}>
                      {m.businessName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                      {m.id} · {m.businessType}
                    </div>
                  </div>
                  {m.existingDecision && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                      background: "rgba(34,197,94,0.1)", color: "var(--green)",
                      padding: "2px 8px", borderRadius: 20,
                    }}>
                      Tier {m.existingDecision.tier}
                    </span>
                  )}
                  <ChevronRight size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
