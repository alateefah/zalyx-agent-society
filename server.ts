import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { AgentOrchestrator } from "./orchestration/agent-orchestrator";
import { BaselineAgent } from "./agents/baseline-agent";
import { ZalyxMerchantSnapshot, AgentProgressEvent } from "./utils/types";
import { mcpClient } from "./utils/mcp-client";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const orchestrator = new AgentOrchestrator();
const baselineAgent = new BaselineAgent();

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    mockMode: !process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "your_qwen_cloud_api_key_here",
    model: process.env.QWEN_MODEL || "qwen-max",
    timestamp: new Date().toISOString(),
  });
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
const frontendDist = path.join(__dirname, "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  const isMock = !process.env.QWEN_API_KEY || process.env.QWEN_API_KEY === "your_qwen_cloud_api_key_here";
  console.log(`\n🚀 Zalyx Agent Society API running on http://localhost:${PORT}`);
  console.log(`   POST /api/underwrite        — Run full agent debate`);
  console.log(`   POST /api/underwrite/stream — SSE streaming (live agent progress)`);
  console.log(`   POST /api/baseline          — Single-agent baseline (Track 3 comparison)`);
  console.log(`   GET  /api/health            — Health check`);
  if (isMock) {
    console.log(`   ⚠️  MOCK MODE (add QWEN_API_KEY to .env for real AI)`);
  } else {
    console.log(`   ✅ Connected to Qwen Cloud (${process.env.QWEN_MODEL || "qwen-max"})`);
  }
});

process.on("SIGTERM", async () => { await mcpClient.disconnect(); process.exit(0); });
process.on("SIGINT",  async () => { await mcpClient.disconnect(); process.exit(0); });
