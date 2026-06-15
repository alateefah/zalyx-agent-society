/**
 * Zalyx Underwriting MCP Server
 *
 * Exposes three tools that agents call via the Model Context Protocol:
 *
 *   check_cbn_compliance     — CBN watchlist / regulatory status
 *   get_industry_benchmarks  — sector GTV and order benchmarks
 *   get_sector_default_rate  — historical default rates by sector + risk tier
 *
 * Transport: stdio (spawned by mcp-client.ts as a child process)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── Sector benchmark data (representative Nigerian SME figures) ───────────────

const INDUSTRY_BENCHMARKS: Record<string, {
  avgMonthlyGTVNaira: number;
  medianMonthlyGTVNaira: number;
  avgOrderValue: number;
  avgActivedays30d: number;
  avgCompletionRate: number;
  description: string;
}> = {
  school: {
    avgMonthlyGTVNaira:    1_800_000,
    medianMonthlyGTVNaira: 1_200_000,
    avgOrderValue:          45_000,
    avgActivedays30d:       8,           // term-fee collection is lumpy
    avgCompletionRate:      88,
    description: "Private schools collect fees in two or three bursts per term. Low active days between collection cycles is normal, not a churn signal.",
  },
  retail: {
    avgMonthlyGTVNaira:    2_500_000,
    medianMonthlyGTVNaira: 1_500_000,
    avgOrderValue:          12_000,
    avgActivedays30d:       22,
    avgCompletionRate:      78,
    description: "Retail merchants transact frequently with lower average order values.",
  },
  logistics: {
    avgMonthlyGTVNaira:    3_200_000,
    medianMonthlyGTVNaira: 2_100_000,
    avgOrderValue:          8_500,
    avgActivedays30d:       25,
    avgCompletionRate:      72,
    description: "Logistics businesses have high frequency and moderate order values. Completion rates are lower due to delivery disputes.",
  },
  food: {
    avgMonthlyGTVNaira:    1_100_000,
    medianMonthlyGTVNaira:   750_000,
    avgOrderValue:            3_500,
    avgActivedays30d:          26,
    avgCompletionRate:         82,
    description: "Food and hospitality merchants transact daily with low order values and high completion rates.",
  },
  services: {
    avgMonthlyGTVNaira:    900_000,
    medianMonthlyGTVNaira: 600_000,
    avgOrderValue:          25_000,
    avgActivedays30d:        14,
    avgCompletionRate:       85,
    description: "Professional services have moderate frequency, higher order values, and good completion rates.",
  },
  default: {
    avgMonthlyGTVNaira:    1_400_000,
    medianMonthlyGTVNaira:   900_000,
    avgOrderValue:            15_000,
    avgActivedays30d:          18,
    avgCompletionRate:         80,
    description: "Cross-sector average across all Zalyx merchant types.",
  },
};

// ── Sector default rate data (based on Zalyx portfolio history) ───────────────

const SECTOR_DEFAULT_RATES: Record<string, Record<string, number>> = {
  // [business_type][risk_tier] = default rate %
  school:    { low: 2.1, moderate: 6.4, high: 18.2 },
  retail:    { low: 3.8, moderate: 9.1, high: 24.5 },
  logistics: { low: 4.2, moderate: 11.3, high: 28.7 },
  food:      { low: 3.1, moderate: 8.6, high: 22.1 },
  services:  { low: 2.8, moderate: 7.9, high: 19.4 },
  default:   { low: 3.4, moderate: 9.0, high: 23.6 },
};

// ── CBN watchlist (stub — real integration would hit CBN API) ─────────────────

const CBN_WATCHLIST = new Set<string>([
  // Populated from CBN/EFCC watchlist in production
  // Left empty for demo — all real merchants return "clear"
]);

const CBN_SECTORS_RESTRICTED = new Set<string>([
  "cryptocurrency", "forex_bureau_unregistered", "ponzi",
]);

// ── Tool implementations ──────────────────────────────────────────────────────

function checkCbnCompliance(args: {
  merchant_id: string;
  business_type: string;
  business_name?: string;
}): object {
  const isBlacklisted = CBN_WATCHLIST.has(args.merchant_id);
  const isSectorRestricted = CBN_SECTORS_RESTRICTED.has(
    args.business_type.toLowerCase().replace(/\s+/g, "_")
  );

  if (isBlacklisted) {
    return {
      status: "blacklisted",
      can_proceed: false,
      details: `Merchant ${args.merchant_id} appears on the CBN/EFCC watchlist. Application must be rejected immediately and flagged for compliance review.`,
      checked_at: new Date().toISOString(),
    };
  }

  if (isSectorRestricted) {
    return {
      status: "restricted_sector",
      can_proceed: false,
      details: `Business type "${args.business_type}" falls under a CBN-restricted sector. Manual compliance clearance required before underwriting can proceed.`,
      checked_at: new Date().toISOString(),
    };
  }

  return {
    status: "clear",
    can_proceed: true,
    details: `${args.merchant_id} has no CBN watchlist or EFCC flag. Business type "${args.business_type}" is an approved sector for Murabaha financing. Proceed with underwriting.`,
    checked_at: new Date().toISOString(),
  };
}

function getIndustryBenchmarks(args: {
  business_type: string;
  merchant_monthly_gtv?: number;
  merchant_active_days_30d?: number;
  merchant_completion_rate?: number;
}): object {
  const typeKey = args.business_type.toLowerCase().split(" ")[0];
  const bench = INDUSTRY_BENCHMARKS[typeKey] ?? INDUSTRY_BENCHMARKS.default;

  const result: Record<string, unknown> = {
    sector: args.business_type,
    benchmarks: bench,
  };

  // If merchant metrics provided, include percentile comparisons
  if (args.merchant_monthly_gtv !== undefined) {
    const gtvPct = args.merchant_monthly_gtv / bench.avgMonthlyGTVNaira;
    result.merchant_vs_sector = {
      monthly_gtv_vs_avg: `${(gtvPct * 100).toFixed(0)}% of sector average`,
      gtv_assessment: gtvPct >= 1.2
        ? "Above average — strong volume relative to sector peers"
        : gtvPct >= 0.8
          ? "In line with sector average"
          : gtvPct >= 0.5
            ? "Below sector average — smaller operator, higher relative risk"
            : "Significantly below sector average — early stage or declining",
    };
  }

  if (args.merchant_active_days_30d !== undefined) {
    const daysPct = args.merchant_active_days_30d / bench.avgActivedays30d;
    result.active_days_context = daysPct >= 0.8
      ? "Active days align with sector norms"
      : `Active days (${args.merchant_active_days_30d}) are below the ${bench.avgActivedays30d}-day sector average. ${bench.description}`;
  }

  if (args.merchant_completion_rate !== undefined) {
    result.completion_rate_context = args.merchant_completion_rate >= bench.avgCompletionRate
      ? `Completion rate (${args.merchant_completion_rate.toFixed(0)}%) is at or above the ${bench.avgCompletionRate}% sector average — positive signal`
      : `Completion rate (${args.merchant_completion_rate.toFixed(0)}%) is below the ${bench.avgCompletionRate}% sector average — warrants monitoring`;
  }

  return result;
}

function getSectorDefaultRate(args: {
  business_type: string;
  risk_tier: "low" | "moderate" | "high";
}): object {
  const typeKey = args.business_type.toLowerCase().split(" ")[0];
  const rates = SECTOR_DEFAULT_RATES[typeKey] ?? SECTOR_DEFAULT_RATES.default;
  const rate = rates[args.risk_tier];
  const allRates = SECTOR_DEFAULT_RATES.default;

  return {
    sector: args.business_type,
    risk_tier: args.risk_tier,
    historical_default_rate_pct: rate,
    cross_sector_average_pct: allRates[args.risk_tier],
    interpretation: rate <= 5
      ? `Low default rate (${rate}%) — this sector/tier combination has a strong repayment track record. Supports approval.`
      : rate <= 15
        ? `Moderate default rate (${rate}%) — manageable with appropriate conditions and monitoring.`
        : `Elevated default rate (${rate}%) — this sector/tier combination has historically high defaults. Strict conditions required or consider rejection.`,
    suggested_murabaha_margin_floor: rate <= 5 ? 10 : rate <= 15 ? 15 : 20,
    data_source: "Zalyx portfolio history (anonymised)",
    note: "Default rate is the % of Murabaha contracts in this cohort that missed 2+ consecutive installments within the first 6 months.",
  };
}

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "zalyx-underwriting-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "check_cbn_compliance",
      description:
        "Check whether a merchant is on the CBN watchlist or operating in a restricted sector. Must be called before any underwriting proceeds. Returns: status (clear/blacklisted/restricted_sector), can_proceed flag, and details.",
      inputSchema: {
        type: "object",
        properties: {
          merchant_id:   { type: "string", description: "Zalyx merchant ID (e.g. ZALYX-001)" },
          business_type: { type: "string", description: "Merchant's business type/sector" },
          business_name: { type: "string", description: "Business name for watchlist matching" },
        },
        required: ["merchant_id", "business_type"],
      },
    },
    {
      name: "get_industry_benchmarks",
      description:
        "Fetch sector benchmarks for a given business type — average monthly GTV, active days, order values, completion rates — and compare the merchant against sector peers. Essential context for the Business Analysis Agent.",
      inputSchema: {
        type: "object",
        properties: {
          business_type:              { type: "string" },
          merchant_monthly_gtv:       { type: "number", description: "Merchant avg monthly GTV in naira" },
          merchant_active_days_30d:   { type: "number", description: "Merchant active days in last 30 days" },
          merchant_completion_rate:   { type: "number", description: "Merchant order completion rate %" },
        },
        required: ["business_type"],
      },
    },
    {
      name: "get_sector_default_rate",
      description:
        "Retrieve Zalyx's historical default rate for a specific sector and risk tier. Used by the Risk Assessment Agent to contextualise the risk score with real portfolio data. Also returns the suggested minimum Murabaha profit margin.",
      inputSchema: {
        type: "object",
        properties: {
          business_type: { type: "string" },
          risk_tier: {
            type: "string",
            enum: ["low", "moderate", "high"],
            description: "Risk tier based on computed risk score",
          },
        },
        required: ["business_type", "risk_tier"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: object;

    if (name === "check_cbn_compliance") {
      result = checkCbnCompliance(args as any);
    } else if (name === "get_industry_benchmarks") {
      result = getIndustryBenchmarks(args as any);
    } else if (name === "get_sector_default_rate") {
      result = getSectorDefaultRate(args as any);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write("[Zalyx MCP Server] Ready — 3 tools registered\n");
});
