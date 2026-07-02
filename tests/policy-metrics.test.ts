import { computeOfferPolicyInputs } from "../utils/policy-metrics";
import { ZalyxMerchantSnapshot } from "../utils/types";

const SNAPSHOT: ZalyxMerchantSnapshot = {
  id: "POLICY-001",
  businessName: "Policy Test Merchant",
  businessType: "School",
  ageInDays: 120,
  orders: { total: 50, completed: 45, cancelled: 1, outstanding: 4 },
  receivables: {
    outstandingOrders: 4,
    totalOwedNaira: 100_000,
    totalCollectedNaira: 70_000,
    uncollectedNaira: 30_000,
  },
  monthlyRevenue: [
    { month: "2026-04", revenueNaira: 1_000_000, orderCount: 10, uniqueCustomers: 8 },
    { month: "2026-05", revenueNaira: 1_200_000, orderCount: 12, uniqueCustomers: 9 },
    { month: "2026-06", revenueNaira: 1_400_000, orderCount: 14, uniqueCustomers: 10 },
  ],
  signals: {
    period30d: {
      activeDays: 16,
      totalOrders: 14,
      avgDailyRevenueNaira: 46_667,
      editRate: 0,
      deleteRate: 0,
      backdateRate: 0,
      batchDays: 0,
    },
    period90d: { activeDays: 45, totalOrders: 36, avgDailyRevenueNaira: 40_000 },
  },
};

describe("monthly offer policy inputs", () => {
  test("same snapshot and review date produce the same policy inputs", () => {
    const asOf = new Date("2026-07-02T12:00:00.000Z");
    const first = computeOfferPolicyInputs(SNAPSHOT, asOf);
    const second = computeOfferPolicyInputs(SNAPSHOT, asOf);

    expect(first).toEqual(second);
    expect(first.reviewCadence).toBe("monthly");
    expect(first.reviewPeriod).toBe("2026-06");
    expect(first.validFrom).toBe("2026-07-01");
    expect(first.validUntil).toBe("2026-07-31");
  });

  test("ignores current partial month when calculating average GTV", () => {
    const asOf = new Date("2026-07-15T12:00:00.000Z");
    const snapshotWithPartialMonth: ZalyxMerchantSnapshot = {
      ...SNAPSHOT,
      monthlyRevenue: [
        ...SNAPSHOT.monthlyRevenue,
        { month: "2026-07", revenueNaira: 50_000, orderCount: 1, uniqueCustomers: 1 },
      ],
    };

    const policy = computeOfferPolicyInputs(snapshotWithPartialMonth, asOf);

    expect(policy.reviewPeriod).toBe("2026-06");
    expect(policy.avgMonthlyGTV).toBe(1_200_000);
  });
});
