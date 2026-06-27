import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface Breadcrumb {
  label: string;
  to?: string;  // if set, renders as a clickable link
}

interface Props {
  isMock?: boolean | null;
  breadcrumbs?: Breadcrumb[];
}

function ZalyxLogo({ height = 32 }: { height?: number }) {
  return (
    <img
      src="/zalyx-logo.png"
      height={height}
      style={{ display: "block", width: "auto" }}
      alt="Zalyx logo"
    />
  );
}

export function Header({ isMock, breadcrumbs }: Props) {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="logo"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => navigate("/")}
          >
            <ZalyxLogo height={26} />
            <div className="logo-divider" />
            <span className="logo-sub">Underwriting</span>
          </button>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <>
              <div className="logo-divider" />
              <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {i > 0 && <ChevronRight size={12} color="var(--text-3)" />}
                    {crumb.to ? (
                      <button
                        onClick={() => navigate(crumb.to!)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          fontSize: 13, color: "var(--text-2)",
                        }}
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>
                        {crumb.label}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
            </>
          )}
        </div>

        {isMock !== null && isMock !== undefined && (
          <span className={`api-badge ${isMock ? "api-badge-mock" : "api-badge-live"}`}>
            <span className="api-badge-dot" />
            {isMock ? "Mock mode" : "Live · Qwen + Tablestore"}
          </span>
        )}
      </div>
    </header>
  );
}
