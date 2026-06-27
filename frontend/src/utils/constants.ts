import {
  ShieldCheck, TrendingUp, AlertTriangle, Landmark, UserCheck,
  School, ShoppingBag, Briefcase, UtensilsCrossed,
} from "lucide-react";
import type { ZalyxMerchantSnapshot } from "../types";

export const API_BASE: string =
  (import.meta.env as Record<string, string>).VITE_API_URL ?? "";

// ── Fallback demo merchants (used when API is unreachable) ────────────────────

export const DEMO_MERCHANTS: Record<string, ZalyxMerchantSnapshot> = {
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
  restaurant: {
    id: "ZALYX-004", businessName: "Lagos Kitchen Co.", businessType: "Food & Beverage", ageInDays: 312,
    orders: { total: 284, completed: 271, cancelled: 3, outstanding: 10 },
    receivables: { outstandingOrders: 10, totalOwedNaira: 148000, totalCollectedNaira: 141000, uncollectedNaira: 7000 },
    monthlyRevenue: [
      { month: "2026-01", revenueNaira: 1820000, orderCount: 38, uniqueCustomers: 31 },
      { month: "2026-02", revenueNaira: 2110000, orderCount: 44, uniqueCustomers: 37 },
      { month: "2026-03", revenueNaira: 2340000, orderCount: 49, uniqueCustomers: 40 },
      { month: "2026-04", revenueNaira: 2580000, orderCount: 53, uniqueCustomers: 44 },
      { month: "2026-05", revenueNaira: 2790000, orderCount: 57, uniqueCustomers: 47 },
      { month: "2026-06", revenueNaira: 1460000, orderCount: 31, uniqueCustomers: 26 },
    ],
    signals: {
      period30d: { activeDays: 24, totalOrders: 57, avgDailyRevenueNaira: 92600, editRate: 0.02, deleteRate: 0.01, backdateRate: 0, batchDays: 0 },
      period90d: { activeDays: 68, totalOrders: 153, avgDailyRevenueNaira: 86400 },
    },
    existingDecision: { score: 88, tier: "A", eligible: true, offerAmountNaira: 500000, fixedFeeNaira: 50000, tenorMonths: 6, confidence: "HIGH", asOfDate: "2026-06-10" },
  },
};

// ── Agent display metadata ─────────────────────────────────────────────────────

export const AGENT_META: Record<string, { color: string; Icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  "Data Quality Agent":        { color: "#6366f1", Icon: ShieldCheck },
  "Business Analysis Agent":   { color: "#22c55e", Icon: TrendingUp },
  "Risk Assessment Agent":     { color: "#f59e0b", Icon: AlertTriangle },
  "Financing Structure Agent": { color: "#3b82f6", Icon: Landmark },
  "Human Review Agent":        { color: "#a78bfa", Icon: UserCheck },
};

export const MSG_TYPE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  position:  { label: "Position",  color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
  challenge: { label: "Challenge", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  rebuttal:  { label: "Rebuttal",  color: "#22c55e", bg: "rgba(34,197,94,0.08)"  },
  verdict:   { label: "Verdict",   color: "#ef4444", bg: "rgba(239,68,68,0.1)"   },
  summary:   { label: "Summary",   color: "#a78bfa", bg: "rgba(167,139,250,0.12)"},
};

// ── Business type → risk label mapping ───────────────────────────────────────

export const RISK_MAP: Record<string, { Icon: React.ComponentType<{ size?: number }>, riskLabel: string, variant: string }> = {
  "School":                       { Icon: School,          riskLabel: "Seasonal revenue", variant: "badge-yellow" },
  "Natural Skin & Hair Products": { Icon: ShoppingBag,     riskLabel: "Moderate risk",    variant: "badge-yellow" },
  "Freelancer":                   { Icon: Briefcase,       riskLabel: "High risk",        variant: "badge-red"    },
  "Food & Beverage":              { Icon: UtensilsCrossed, riskLabel: "Strong approval",  variant: "badge-green"  },
};

export const DEFAULT_RISK = { Icon: Briefcase, riskLabel: "Custom", variant: "badge-yellow" };
