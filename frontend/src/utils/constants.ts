import {
  ShieldCheck, TrendingUp, AlertTriangle, Landmark, UserCheck,
  School, ShoppingBag, Briefcase, UtensilsCrossed,
} from "lucide-react";

export const API_BASE: string =
  (import.meta.env as Record<string, string>).VITE_API_URL ?? "";

// ── Agent display metadata ─────────────────────────────────────────────────────

export const AGENT_META: Record<string, { color: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  "Data Quality Agent":        { color: "#2563eb", Icon: ShieldCheck },
  "Business Analysis Agent":   { color: "#0f766e", Icon: TrendingUp },
  "Risk Assessment Agent":     { color: "#b45309", Icon: AlertTriangle },
  "Financing Structure Agent": { color: "#475569", Icon: Landmark },
  "Human Review Agent":        { color: "#6b7280", Icon: UserCheck },
};

export const MSG_TYPE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  position:  { label: "Position",  color: "#0f766e", bg: "rgba(15,118,110,0.09)" },
  challenge: { label: "Challenge", color: "#b45309", bg: "rgba(180,83,9,0.1)" },
  rebuttal:  { label: "Rebuttal",  color: "#0f766e", bg: "rgba(15,118,110,0.08)" },
  verdict:   { label: "Verdict",   color: "#b91c1c", bg: "rgba(185,28,28,0.08)" },
  summary:   { label: "Summary",   color: "#475569", bg: "rgba(71,85,105,0.1)" },
};

// ── Business type → risk label mapping ───────────────────────────────────────

export const RISK_MAP: Record<string, { Icon: React.ComponentType<{ size?: number }>, riskLabel: string, variant: string }> = {
  "School":                       { Icon: School,          riskLabel: "Seasonal revenue", variant: "badge-yellow" },
  "Natural Skin & Hair Products": { Icon: ShoppingBag,     riskLabel: "Moderate risk",    variant: "badge-yellow" },
  "Freelancer":                   { Icon: Briefcase,       riskLabel: "High risk",        variant: "badge-red"    },
  "Food & Beverage":              { Icon: UtensilsCrossed, riskLabel: "Strong approval",  variant: "badge-green"  },
};

export const DEFAULT_RISK = { Icon: Briefcase, riskLabel: "Custom", variant: "badge-yellow" };
