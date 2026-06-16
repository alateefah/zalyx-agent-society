# Zalyx Agent Society

**Multi-Agent Merchant Underwriting System** — Qwen Cloud Hackathon, Track 3: Agent Society

A five-agent debate pipeline that makes smarter, more transparent merchant financing decisions than any single AI call. Built on real anonymized data from [Zalyx](https://zalyx.com), a Nigerian fintech platform serving 700+ merchants.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Powered by Qwen Cloud](https://img.shields.io/badge/AI-Qwen%20Cloud-blue)](https://www.alibabacloud.com/product/machine-learning)
[![CI](https://github.com/alateefah/zalyx-agent-society/actions/workflows/ci.yml/badge.svg)](https://github.com/alateefah/zalyx-agent-society/actions/workflows/ci.yml)

---

## What it does

Five specialized AI agents debate every financing application, each enriched with live data from a custom **MCP (Model Context Protocol) server**. Every agent uses **Qwen function calling** to return structured JSON — not parsed prose.

| Agent | Role | MCP Tool Used |
|---|---|---|
| 🔍 Data Quality | Validates completeness, flags anomalies | `check_cbn_compliance` |
| 📈 Business Analysis | Assesses revenue trajectory, health score | `get_industry_benchmarks` |
| ⚠️ Risk Assessment | **Challenges** the Business Agent's assumptions | `get_sector_default_rate` |
| 🔄 Debate Round | Business Agent **rebuts**; Risk Agent issues **final verdict** | — |
| 💰 Financing Structure | Designs Murabaha-compliant terms from GTV | — |
| 👤 Human Review | Synthesises the full debate → final decision | — |

The system also runs a **single-agent baseline** in parallel — same data, one LLM call — to demonstrate measurable improvement from the multi-agent approach.

---

## Key design decisions

**Murabaha financing (Islamic finance compliant)**
Zalyx does not lend money. It purchases assets on the merchant's behalf at a disclosed cost price, then sells those assets to the merchant at a fixed sale price. The difference is Zalyx's profit margin — no interest, no compounding, no late fees.

```
Sale price  = % of merchant's avg monthly GTV (risk-tiered)
Cost price  = sale price × (1 − profit margin)
Installment = sale price ÷ tenor months
```

| Risk tier | GTV offer | Tenor | Profit margin |
|---|---|---|---|
| Low (0–35) | 25% of avg monthly GTV | 6 months | 10% |
| Moderate (35–65) | 15% of avg monthly GTV | 3 months | 15% |
| High (65–80) | 5% of avg monthly GTV | 2 months | 20% |
| Very high (80+) | Rejected | — | — |

Affordability cap: monthly installment must be ≤ 20% of avg monthly GTV. If it exceeds that, the sale price is reduced until it fits.

**Conditional debate round**
The debate round (Stage 3b/3c) only fires when the Business Analyst's health score > 55 AND the Risk Officer's score > 35 — i.e. when agents genuinely disagree. Clear approvals and clear rejections skip it, saving LLM calls.

**All 5 agents use Qwen function calling**
Every agent submits its output via a structured tool call rather than prose:

| Agent | Tool |
|---|---|
| Data Quality | `submit_data_quality_result` |
| Business Analysis | `submit_business_position` |
| Risk Assessment | `submit_risk_verdict` |
| Financing Structure | `structure_murabaha_offer` |
| Human Review | `issue_underwriting_decision` |

This means every field in the final report — scores, risk factors, Murabaha terms, disbursement conditions — comes from a structured JSON argument, not string parsing.

**MCP integration**
A dedicated MCP server (stdio transport, `@modelcontextprotocol/sdk`) exposes three tools that agents call during reasoning — not just pre-loaded context but live lookups that change what the agents say:

- `check_cbn_compliance` — blocks applications from CBN watchlist or restricted sectors before underwriting begins
- `get_industry_benchmarks` — gives the Business Analyst sector-specific GTV averages, active day norms, and completion rate benchmarks to compare this merchant against peers
- `get_sector_default_rate` — gives the Risk Agent Zalyx's historical default rates for this sector + risk tier, and suggests a minimum Murabaha profit margin

**DebateLedger**
When the debate round fires, a deterministic `DebateModerator` parses the transcript into typed `DebateClaim[]` objects — each with a `claimId`, evidence from both sides, and a resolution type (`claim_withdrawn`, `risk_concern_upheld`, `compromise_condition_set`, etc.). This makes the agent negotiation machine-readable and auditable, not just a chat log.

---

## Architecture

```
Browser (React + Vite)
  │
  │  SSE stream: POST /api/underwrite/stream
  │  Parallel:   POST /api/baseline
  ▼
Express API (Node.js / TypeScript)
  │
  ▼
Agent Orchestrator
  │
  ├─ Stage 1+2 (parallel):
  │    ├── Data Quality Agent  ──────── MCP: check_cbn_compliance
  │    └── Business Analysis Agent ──── MCP: get_industry_benchmarks
  │
  ├─ Stage 3:
  │    └── Risk Assessment Agent ─────── MCP: get_sector_default_rate
  │
  ├─ Stage 3b/3c (conditional — only when agents disagree):
  │    ├── Business Analysis Agent (rebuttal)
  │    └── Risk Assessment Agent (final verdict)
  │         └── DebateModerator → DebateLedger (typed claims, deterministic)
  │
  ├─ Stage 4 (skipped if very high risk):
  │    └── Financing Structure Agent (Murabaha engine)
  │
  └─ Stage 5:
       └── Human Review Agent → Decision + DecisionDelta + RunObservability
  │
  ├── Qwen Cloud API (DashScope, qwen-max, function calling — all 5 agents)
  └── MCP Server (stdio) ← mcp-server/index.ts
        ├── check_cbn_compliance
        ├── get_industry_benchmarks
        └── get_sector_default_rate
```

![Architecture diagram](./architecture.svg)

---

## Quickstart (local)

### Prerequisites

- Node.js 20+
- A Qwen Cloud API key from [Alibaba Cloud DashScope](https://dashscope-intl.aliyuncs.com)

### 1. Clone and install

```bash
git clone https://github.com/alateefah/zalyx-agent-society.git
cd zalyx-agent-society

yarn install
cd frontend && yarn install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
QWEN_API_KEY=your_qwen_cloud_api_key_here
QWEN_MODEL=qwen-max
QWEN_API_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
PORT=3001
```

> **No API key?** The system runs in mock mode automatically — all five agents return realistic demo responses. The header shows a pulsing **"Mock mode"** badge so you always know which mode you're in.

### 3. Run

```bash
yarn dev
```

Opens:
- Backend API: http://localhost:3001
- Frontend UI: http://localhost:5173

---

## Demo merchants

Three real anonymized Zalyx merchants with different risk profiles:

| ID | Business type | Baseline | Multi-agent |
|---|---|---|---|
| ZALYX-001 | School | requires-clarification | **Approved** — debate surfaces term-fee seasonality |
| ZALYX-002 | Natural skin & hair | requires-clarification | **Approved** — MCP sector benchmarks contextualise low GTV |
| ZALYX-003 | Freelancer | requires-clarification | **Approved** — high sector default rate (23.6%) covenanted into terms |

The decision quality difference is in the output structure: the multi-agent pipeline produces a formal `DebateResolution` record, typed `DebateLedger` claims, Murabaha installment schedule, and `RunObservability` for every run. The baseline produces a paragraph.

### Benchmark Results (committed — `benchmark/results.md`)

| Metric | Value |
|---|---|
| Merchants benchmarked | 3 |
| Decisions that differed (baseline vs multi-agent) | **3/3** |
| Debate round fired | **3/3** merchants |
| Total structured risk factors surfaced | 9 |
| Avg structured output completeness | **100%** |
| Avg actionability score | **100/100** |
| Avg baseline latency | 0.5s |
| Avg multi-agent latency | 5.6s |
| Qwen function calls per run | 8 (all 5 agents use structured tool output) |
| MCP calls per run | 3 (CBN compliance + sector benchmarks + default rate) |

Full per-merchant breakdown: [`benchmark/results.md`](benchmark/results.md) · raw data: [`benchmark/results.json`](benchmark/results.json)

Run yourself: `yarn benchmark`

---

## API Reference

### `POST /api/underwrite/stream`

Run the full 5-agent debate with **live SSE streaming**. Each agent's output is streamed as it completes — no waiting for the full pipeline.

**Body:** `ZalyxMerchantSnapshot` (see `utils/types.ts`)

**Response:** `text/event-stream` — emits `AgentProgressEvent` objects as agents complete, then a final `UnderwritingReport`.

### `POST /api/baseline`

Run the single-agent baseline (for Track 3 comparison).

**Body:** Same `ZalyxMerchantSnapshot`

**Response:** `BaselineReport` with decision, reasoning, and confidence.

### `GET /api/health`

```json
{ "status": "ok", "mockMode": false, "model": "qwen-max", "timestamp": "..." }
```

---

## Qwen Cloud integration

All five agents use `chatWithTools()` with a typed tool definition. Qwen returns a `tool_calls` object; the orchestrator reads `tool_calls[0].function.arguments` as structured JSON:

```typescript
const response = await client.chat.completions.create({
  model: "qwen-max",
  messages: [...],
  tools: [SUBMIT_RISK_VERDICT_TOOL],   // e.g. for Risk Assessment Agent
  tool_choice: "auto",
});
const args = JSON.parse(
  response.choices[0].message.tool_calls[0].function.arguments
);
// → { risk_score: 42, risk_factors: [...], recommendation: "approve_with_conditions" }
```

The MCP server runs as a stdio child process. Agents call it mid-reasoning:

```typescript
// Data Quality Agent
const cbn = await mcpClient.checkCbnCompliance({ merchant_id, business_type });
// → { status: "clear", can_proceed: true, details: "..." }

// Business Analysis Agent
const bench = await mcpClient.getIndustryBenchmarks({ business_type, merchant_monthly_gtv });
// → { benchmarks: {...}, merchant_vs_sector: { gtv_assessment: "..." } }

// Risk Assessment Agent
const dr = await mcpClient.getSectorDefaultRate({ business_type, risk_tier: "moderate" });
// → { historical_default_rate_pct: 6.4, suggested_murabaha_margin_floor: 15 }
```

All MCP calls degrade gracefully — if the server is unavailable, agents proceed without the extra context rather than failing the request.

---

## Project structure

```
zalyx-agent-society/
├── agents/
│   ├── baseline-agent.ts            # Single-agent baseline (Track 3 comparison)
│   ├── business-analysis-agent.ts   # MCP: get_industry_benchmarks
│   ├── data-quality-agent.ts        # MCP: check_cbn_compliance
│   ├── debate-moderator.ts          # Deterministic DebateLedger builder (no LLM)
│   ├── financing-structure-agent.ts # Murabaha structuring via murabaha-engine
│   ├── human-review-agent.ts        # Final decision (function calling)
│   └── risk-assessment-agent.ts     # MCP: get_sector_default_rate
├── mcp-server/
│   └── index.ts                     # MCP server (stdio) — 3 underwriting tools
├── orchestration/
│   └── agent-orchestrator.ts        # Parallel stages, conditional debate, SSE events
├── utils/
│   ├── mcp-client.ts                # MCP client singleton with clean shutdown
│   ├── murabaha-engine.ts           # Pure Murabaha math (testable, no side effects)
│   ├── qwen-client.ts               # Qwen Cloud (DashScope) API client
│   └── types.ts                     # All types: snapshot, report, ledger, observability
├── benchmark/
│   ├── run.ts                       # Benchmark runner (yarn benchmark)
│   ├── results.md                   # Committed benchmark results
│   └── results.json                 # Raw benchmark data
├── data/
│   └── snapshots/                   # Anonymized merchant JSON snapshots
├── tests/
│   ├── murabaha.test.ts             # 25 unit tests for Murabaha engine
│   └── orchestrator.test.ts         # 7 integration tests for the pipeline
├── frontend/                        # React + Vite UI
│   └── src/
│       ├── App.tsx                  # SSE consumer + Debate Ledger / Delta / Obs panels
│       └── App.css
├── .github/
│   └── workflows/ci.yml             # CI: type-check, frontend build, docker build
├── server.ts                        # Express API + SSE endpoint
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Tests

```bash
yarn test
```

- `tests/murabaha.test.ts` — 25 unit tests: risk tier selection, GTV pricing, affordability cap, installment math
- `tests/orchestrator.test.ts` — 7 integration tests: pipeline completes, debate fires/skips, Stage 4 skip, all report fields present

32/32 passing. Jest exits cleanly — `afterAll()` closes the MCP stdio child process explicitly (no `forceExit` needed).

---

## Docker

```bash
docker compose up --build
```

App available at http://localhost:3001. Docker build is verified on every push via GitHub Actions.

---

## Deploy to Alibaba Cloud ECS

```bash
# On your ECS instance (Ubuntu 22.04):
curl -fsSL https://get.docker.com | sh
git clone https://github.com/alateefah/zalyx-agent-society.git
cd zalyx-agent-society
echo "QWEN_API_KEY=your_key" > .env
echo "QWEN_MODEL=qwen-max" >> .env
docker compose up -d --build
curl http://localhost:3001/api/health
```

---

## Hackathon

**Event:** Qwen Cloud Hackathon 2026
**Track:** Track 3 — Agent Society
**Deadline:** July 9, 2026 @ 2:00pm PDT
**Repo:** https://github.com/alateefah/zalyx-agent-society

---

## License

MIT — see [LICENSE](./LICENSE)
