/**
 * Zalyx MCP Client
 *
 * Spawns the underwriting MCP server as a child process and exposes
 * typed wrappers for each tool. Agents import and call these directly.
 *
 * Singleton — the server process is started once and reused across all agents.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";

// ── Types returned by each tool ───────────────────────────────────────────────

export interface CbnComplianceResult {
  status: "clear" | "blacklisted" | "restricted_sector";
  can_proceed: boolean;
  details: string;
  checked_at: string;
}

export interface IndustryBenchmarksResult {
  sector: string;
  benchmarks: {
    avgMonthlyGTVNaira: number;
    medianMonthlyGTVNaira: number;
    avgOrderValue: number;
    avgActivedays30d: number;
    avgCompletionRate: number;
    description: string;
  };
  merchant_vs_sector?: {
    monthly_gtv_vs_avg: string;
    gtv_assessment: string;
  };
  active_days_context?: string;
  completion_rate_context?: string;
}

export interface SectorDefaultRateResult {
  sector: string;
  risk_tier: string;
  historical_default_rate_pct: number;
  cross_sector_average_pct: number;
  interpretation: string;
  suggested_murabaha_margin_floor: number;
  data_source: string;
  note: string;
}

// ── Singleton client ──────────────────────────────────────────────────────────

let _client: Client | null = null;
let _transport: StdioClientTransport | null = null;
let _connecting: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (_client) return _client;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const client = new Client(
      { name: "zalyx-underwriting-agent", version: "1.0.0" },
      { capabilities: {} }
    );

    // In production Docker, the MCP server is compiled JS (dist/mcp-server/index.js).
    // In development, spawn via ts-node so we don't require a build step.
    const isProd = process.env.NODE_ENV === "production";

    const serverPath = isProd
      ? path.resolve(__dirname, "../mcp-server/index.js")   // dist/mcp-server/index.js
      : path.resolve(__dirname, "../mcp-server/index.ts");  // source

    const command = isProd ? "node" : "npx";
    const args = isProd ? [serverPath] : ["ts-node", "--esm", serverPath];

    const transport = new StdioClientTransport({
      command,
      args,
      env: Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined)
      ) as Record<string, string>,
    });

    // Store transport so disconnect() can close the stdio child process explicitly
    _transport = transport;
    await client.connect(transport);
    _client = client;
    console.log("🔌 MCP client connected to Zalyx Underwriting MCP Server");
    return client;
  })();

  return _connecting;
}

async function callTool<T>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const result = await client.callTool({ name: toolName, arguments: args });

  const content = result.content as Array<{ type: string; text: string }>;

  if (result.isError) {
    throw new Error(`MCP tool ${toolName} failed: ${content[0]?.text}`);
  }

  const text = content[0]?.text ?? "{}";
  return JSON.parse(text) as T;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const mcpClient = {
  /**
   * Check if merchant is on CBN watchlist or in a restricted sector.
   * Must be called before any underwriting proceeds.
   */
  checkCbnCompliance(args: {
    merchant_id: string;
    business_type: string;
    business_name?: string;
  }): Promise<CbnComplianceResult> {
    return callTool<CbnComplianceResult>("check_cbn_compliance", args);
  },

  /**
   * Get sector benchmarks and compare this merchant against peers.
   */
  getIndustryBenchmarks(args: {
    business_type: string;
    merchant_monthly_gtv?: number;
    merchant_active_days_30d?: number;
    merchant_completion_rate?: number;
  }): Promise<IndustryBenchmarksResult> {
    return callTool<IndustryBenchmarksResult>("get_industry_benchmarks", args);
  },

  /**
   * Get historical default rate for this sector + risk tier.
   */
  getSectorDefaultRate(args: {
    business_type: string;
    risk_tier: "low" | "moderate" | "high";
  }): Promise<SectorDefaultRateResult> {
    return callTool<SectorDefaultRateResult>("get_sector_default_rate", args);
  },

  /** Close the MCP server process and kill the stdio child process cleanly. */
  async disconnect() {
    // Close the MCP protocol session first
    if (_client) {
      try { await _client.close(); } catch { /* ignore close errors */ }
      _client = null;
      _connecting = null;
    }
    // Explicitly close the transport — this kills the spawned child process,
    // preventing Jest (and other test runners) from hanging on open stdio handles.
    if (_transport) {
      try { await _transport.close(); } catch { /* ignore if already closed */ }
      _transport = null;
    }
  },
};
