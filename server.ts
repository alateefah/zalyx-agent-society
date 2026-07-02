import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { AgentOrchestrator } from "./orchestration/agent-orchestrator";
import { BaselineAgent } from "./agents/baseline-agent";
import { assertQwenConfigured } from "./utils/qwen-client";
import { ZalyxMerchantSnapshot, AgentProgressEvent } from "./utils/types";
import { mcpClient } from "./utils/mcp-client";
import {
  initTablestore,
  tablestoreConfigured,
  decisionStoreMode,
  getMerchantSnapshot,
  listMerchants,
  saveUnderwritingDecision,
  saveMerchantSnapshot,
  getMerchantDecisionSummaries,
  getDecisionById,
  getDecisionsForMerchant,
  listDecisionsByType,
} from "./utils/tablestore";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const orchestrator = new AgentOrchestrator();
const baselineAgent = new BaselineAgent();

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    ai: {
      provider: "Qwen Cloud",
      model: process.env.QWEN_MODEL || "qwen-max",
      mockMode: false,
      configured: true,
    },
    database: {
      provider: "Alibaba Cloud Tablestore",
      instance: process.env.OTS_INSTANCE || null,
      mockMode: false,
      merchantSource: tablestoreConfigured ? "tablestore" : "local-files",
      decisionStore: decisionStoreMode,
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Merchants ─────────────────────────────────────────────────────────────────
app.get("/api/merchants", async (_req: Request, res: Response) => {
  try {
    res.json(await listMerchants());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to list merchants" });
  }
});

app.get("/api/merchants/:id", async (req: Request, res: Response) => {
  try {
    const snapshot = await getMerchantSnapshot(req.params.id);
    if (!snapshot) {
      res.status(404).json({ error: `Merchant ${req.params.id} not found` });
      return;
    }
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load merchant" });
  }
});

app.post("/api/merchants", async (req: Request, res: Response) => {
  try {
    const snapshot: ZalyxMerchantSnapshot = req.body;
    if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
      res.status(400).json({
        error: "Invalid snapshot. Required: id, businessName, businessType, ageInDays, orders, receivables, monthlyRevenue[], signals",
      });
      return;
    }
    await saveMerchantSnapshot(snapshot);
    res.status(201).json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to save merchant" });
  }
});

app.get("/api/merchants/:merchantId/decisions", async (req: Request, res: Response) => {
  try {
    res.json(await getMerchantDecisionSummaries(req.params.merchantId));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load decision summaries" });
  }
});

app.get("/api/merchants/:merchantId/decisions/:requestId", async (req: Request, res: Response) => {
  try {
    const item = await getDecisionById(req.params.merchantId, req.params.requestId);
    if (!item) {
      res.status(404).json({ error: `Decision ${req.params.requestId} not found` });
      return;
    }
    res.json({ report: item.report, createdAt: item.createdAt });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load decision" });
  }
});

// ── Decision history ──────────────────────────────────────────────────────────
app.get("/api/decisions/:merchantId", async (req: Request, res: Response) => {
  try {
    res.json(await getDecisionsForMerchant(req.params.merchantId));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to load decisions" });
  }
});

app.get("/api/decisions", async (req: Request, res: Response) => {
  const type = (req.query.type as string) || "approved";
  if (!["approved", "rejected", "requires-clarification"].includes(type)) {
    res.status(400).json({ error: "type must be approved | rejected | requires-clarification" });
    return;
  }
  try {
    res.json(
      await listDecisionsByType(type as "approved" | "rejected" | "requires-clarification", Number(req.query.limit) || 50)
    );
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to query decisions" });
  }
});

// Main underwriting endpoint
app.post("/api/underwrite", async (req: Request, res: Response) => {
  try {
    const snapshot: ZalyxMerchantSnapshot = req.body;

    if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
      res.status(400).json({
        error: "Invalid snapshot. Required: id, businessName, businessType, ageInDays, orders, receivables, monthlyRevenue[], signals",
      });
      return;
    }

    console.log(`\n🔄 Underwriting request: ${snapshot.businessName} (${snapshot.monthlyRevenue.length} months of data)`);
    const report = await orchestrator.runUnderwriting(snapshot);
    await saveMerchantSnapshot(snapshot);
    await saveUnderwritingDecision(report);
    console.log(`✅ Completed: ${report.humanReview.finalRecommendation.toUpperCase()} — ${report.executionTime}`);

    res.json(report);
  } catch (error: any) {
    console.error("❌ Underwriting error:", error);
    res.status(500).json({ error: error?.message || "Underwriting failed" });
  }
});

// SSE streaming endpoint — emits AgentProgressEvent per agent stage in real-time
app.post("/api/underwrite/stream", async (req: Request, res: Response) => {
  const snapshot: ZalyxMerchantSnapshot = req.body;

  if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
    res.status(400).json({ error: "Invalid snapshot." });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  const send = (event: AgentProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    console.log(`\n🌊 SSE underwriting: ${snapshot.businessName}`);
    const report = await orchestrator.runUnderwriting(snapshot, send);
    await saveMerchantSnapshot(snapshot);
    await saveUnderwritingDecision(report);
    send({ type: "done", report });
    console.log(`✅ SSE complete: ${report.humanReview.finalRecommendation.toUpperCase()} — ${report.executionTime}`);
  } catch (error: any) {
    console.error("❌ SSE underwriting error:", error);
    send({ type: "error", message: error?.message || "Underwriting failed" });
  } finally {
    res.end();
  }
});

// Single-agent baseline endpoint (Track 3 comparison)
app.post("/api/baseline", async (req: Request, res: Response) => {
  try {
    const snapshot: ZalyxMerchantSnapshot = req.body;

    if (!snapshot.id || !snapshot.businessName || !snapshot.signals || !snapshot.monthlyRevenue) {
      res.status(400).json({ error: "Invalid snapshot." });
      return;
    }

    console.log(`\n🎯 Baseline request: ${snapshot.businessName}`);
    const report = await baselineAgent.evaluate(snapshot);
    console.log(`✅ Baseline: ${report.decision.toUpperCase()} — ${report.executionTime}`);

    res.json(report);
  } catch (error: any) {
    console.error("❌ Baseline error:", error);
    res.status(500).json({ error: error?.message || "Baseline failed" });
  }
});

// Serve React frontend in production
const frontendDist = path.join(process.cwd(), "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const PORT = parseInt(process.env.PORT || "3001", 10);

(async () => {
  console.log("\n🔧 Initialising services (Qwen Cloud + Alibaba Cloud Tablestore)...");
  assertQwenConfigured();
  await initTablestore();

  app.listen(PORT, () => {
    console.log(`\n🚀 Zalyx Agent Society API running on http://localhost:${PORT}`);
    console.log(`   POST /api/underwrite        — Run full agent debate`);
    console.log(`   POST /api/underwrite/stream — SSE streaming (live agent progress)`);
    console.log(`   POST /api/baseline          — Single-agent baseline comparison`);
    console.log(`   GET  /api/merchants         — List merchants`);
    console.log(`   GET  /api/merchants/:id     — Load merchant snapshot`);
    console.log(`   POST /api/merchants         — Save merchant snapshot`);
    console.log(`   GET  /api/decisions/:id     — Past decisions for a merchant`);
    console.log(`   GET  /api/decisions?type=   — Query by decision type (secondary index)`);
    console.log(`   GET  /api/health            — Health check`);
    console.log(`\n   ✅ Qwen Cloud (${process.env.QWEN_MODEL || "qwen-max"})`);
    console.log(tablestoreConfigured ? `   ✅ Merchant source: Alibaba Cloud Tablestore (${process.env.OTS_INSTANCE})` : `   ✅ Merchant source: local snapshot files`);
    console.log(`   ✅ Decision store: ${decisionStoreMode}`);
  });
})();

process.on("SIGTERM", async () => { await mcpClient.disconnect(); process.exit(0); });
process.on("SIGINT",  async () => { await mcpClient.disconnect(); process.exit(0); });
