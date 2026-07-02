import { ZalyxMerchantSnapshot } from "./types";

export interface DeterministicRiskProfile {
  overallRiskScore: number;
  volatilityIndex: number;
  concentrationRisk: "low" | "medium" | "high";
  operationalStability: number;
  riskFactors: string[];
  receivablesRate: number;
}

export interface OfferPolicyInputs {
  avgMonthlyGTV: number;
  riskScore: number;
  reviewCadence: "monthly";
  reviewPeriod: string;
  validFrom: string;
  validUntil: string;
  policyVersion: string;
}

const POLICY_VERSION = "murabaha-range-v1";

function currentYearMonth(asOf = new Date()): string {
  return asOf.toISOString().slice(0, 7);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function latestCompleteBuckets(snapshot: ZalyxMerchantSnapshot, asOf = new Date()) {
  const current = currentYearMonth(asOf);
  const buckets = snapshot.monthlyRevenue.filter((m) => m.month < current);
  return buckets.length > 0 ? buckets : snapshot.monthlyRevenue;
}

export function computeAverageMonthlyGTV(snapshot: ZalyxMerchantSnapshot, asOf = new Date()): number {
  const buckets = latestCompleteBuckets(snapshot, asOf);
  if (buckets.length === 0) return 0;
  return Math.round(buckets.reduce((sum, m) => sum + m.revenueNaira, 0) / buckets.length);
}

export function computeDeterministicRiskProfile(
  snapshot: ZalyxMerchantSnapshot,
  asOf = new Date()
): DeterministicRiskProfile {
  const riskFactors: string[] = [];
  let riskScore = 0;

  const totalRevenue = snapshot.monthlyRevenue.reduce((s, m) => s + m.revenueNaira, 0);
  const receivablesRate = totalRevenue > 0
    ? (snapshot.receivables.uncollectedNaira / totalRevenue) * 100
    : 0;
  if (receivablesRate > 30) {
    riskScore += 20;
    riskFactors.push(`High uncollected receivables (${receivablesRate.toFixed(0)}% of total revenue)`);
  } else if (receivablesRate > 15) {
    riskScore += 10;
    riskFactors.push(`Moderate uncollected receivables (${receivablesRate.toFixed(0)}% of revenue)`);
  }

  const revenues = snapshot.monthlyRevenue.map((m) => m.revenueNaira);
  const mean = revenues.length > 0 ? revenues.reduce((s, r) => s + r, 0) / revenues.length : 0;
  const stdDev = revenues.length > 0
    ? Math.sqrt(revenues.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / revenues.length)
    : 0;
  const volatilityIndex = mean > 0 ? Math.round(Math.min((stdDev / mean) * 100, 100)) : 50;
  if (volatilityIndex > 60) {
    riskScore += 15;
    riskFactors.push(`High revenue volatility (CV: ${volatilityIndex}%) — unpredictable cash flow`);
  }

  const completeBuckets = latestCompleteBuckets(snapshot, asOf);
  const revenuesForTrend = completeBuckets.map((m) => m.revenueNaira);
  if (revenuesForTrend.length > 1) {
    const latest = revenuesForTrend[revenuesForTrend.length - 1];
    const peak = Math.max(...revenuesForTrend);
    const decline = peak > 0 ? ((latest - peak) / peak) * 100 : 0;
    if (decline < -50) {
      riskScore += 20;
      riskFactors.push(`Revenue down ${Math.abs(decline).toFixed(0)}% from peak — significant decline`);
    } else if (decline < -25) {
      riskScore += 10;
      riskFactors.push(`Revenue down ${Math.abs(decline).toFixed(0)}% from peak`);
    }
  }

  if (snapshot.signals.period30d.activeDays === 0) {
    riskScore += 25;
    riskFactors.push("No platform activity in last 30 days — possible churn or business pause");
  } else if (snapshot.signals.period30d.activeDays < 5) {
    riskScore += 10;
    riskFactors.push(`Low activity (${snapshot.signals.period30d.activeDays} days) in last 30 days`);
  }

  if (snapshot.ageInDays < 60) {
    riskScore += 15;
    riskFactors.push(`Early-stage business (${snapshot.ageInDays} days) — limited repayment track record`);
  } else if (snapshot.ageInDays < 90) {
    riskScore += 5;
  }

  if (snapshot.monthlyRevenue.length < 2) {
    riskScore += 10;
    riskFactors.push("Single month of data — impossible to assess trend or seasonality");
  }

  const completionRate = snapshot.orders.total > 0
    ? snapshot.orders.completed / snapshot.orders.total
    : 0;
  if (completionRate < 0.5) {
    riskScore += 15;
    riskFactors.push(`Low order completion rate (${(completionRate * 100).toFixed(0)}%) — collections concern`);
  }

  const maxMonthCustomers = snapshot.monthlyRevenue.length > 0
    ? Math.max(...snapshot.monthlyRevenue.map((m) => m.uniqueCustomers))
    : 0;
  const concentrationRisk: "low" | "medium" | "high" =
    maxMonthCustomers > 15 ? "low" : maxMonthCustomers > 8 ? "medium" : "high";
  if (concentrationRisk === "high") {
    riskScore += 10;
    riskFactors.push(`Low customer count (max ${maxMonthCustomers}/month) — revenue concentration risk`);
  }

  const activityRatio = snapshot.signals.period90d.activeDays / 90;
  const operationalStability = Math.round(activityRatio * 100);

  return {
    overallRiskScore: Math.min(riskScore, 100),
    volatilityIndex,
    concentrationRisk,
    operationalStability,
    riskFactors,
    receivablesRate,
  };
}

export function computeOfferPolicyInputs(
  snapshot: ZalyxMerchantSnapshot,
  asOf = new Date()
): OfferPolicyInputs {
  const buckets = latestCompleteBuckets(snapshot, asOf);
  const reviewPeriod = buckets[buckets.length - 1]?.month ?? currentYearMonth(asOf);
  const [year, month] = reviewPeriod.split("-").map(Number);
  const validFrom = new Date(Date.UTC(year, month, 1));
  const validUntil = new Date(Date.UTC(year, month + 1, 0));

  return {
    avgMonthlyGTV: computeAverageMonthlyGTV(snapshot, asOf),
    riskScore: computeDeterministicRiskProfile(snapshot, asOf).overallRiskScore,
    reviewCadence: "monthly",
    reviewPeriod,
    validFrom: ymd(validFrom),
    validUntil: ymd(validUntil),
    policyVersion: POLICY_VERSION,
  };
}
