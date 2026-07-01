import { ShieldCheck, TrendingUp, AlertTriangle, Landmark, UserCheck } from "lucide-react";

const STEPS = [
  { n: 1, name: "Data Quality",  desc: "Validates completeness, flags anomalies",   Icon: ShieldCheck  },
  { n: 2, name: "Business",      desc: "Revenue health & viability",                Icon: TrendingUp   },
  { n: 3, name: "Risk",          desc: "Challenges assumptions, flags volatility",  Icon: AlertTriangle },
  { n: 4, name: "Financing",     desc: "Structures Murabaha-compliant offer",       Icon: Landmark     },
  { n: 5, name: "Human Review",  desc: "Synthesises debate, issues final decision", Icon: UserCheck    },
];

export function PipelineSteps() {
  return (
    <div className="pipeline-row">
      {STEPS.map(({ n, name, desc, Icon }) => (
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
  );
}
