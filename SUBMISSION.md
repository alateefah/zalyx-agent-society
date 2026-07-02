# Zalyx Agent Society — Hackathon Submission

**Qwen Cloud Hackathon 2026 · Track 3: Agent Society**

**Live deployment**

- App: http://139.129.19.5:3001/
- Health: http://139.129.19.5:3001/api/health
- Cloud state: Qwen Cloud `mockMode: false`; Alibaba Cloud Tablestore `mockMode: false`; Tablestore instance `zalyx-agent-db`

---

## What we built

A five-agent underwriting system that debates every merchant financing application — built on real anonymized data from Zalyx, a Nigerian fintech serving 700+ merchants.

The core insight: a single LLM call makes risk decisions the same way a single analyst does — it sees what it's primed to see. Five specialized agents with different mandates, forced to challenge each other, consistently catch what one agent misses.

---

## The problem

Zalyx offers Murabaha-compliant financing to Nigerian SME merchants. Murabaha is Islamic finance: Zalyx purchases an asset on the merchant's behalf at cost price, then sells it at a fixed sale price (cost + disclosed profit margin). No interest, no compounding, no late fees.

The underwriting challenge: the same revenue data looks different depending on what you're looking for. A school with ₦2M/month average GTV but only 7 active days in the last 30 days looks like churn to a risk model — until you understand that school term fees are collected twice a year in large batches, not daily. A single LLM call doesn't know this. A debate surfaces it.

---

## How it works

### Five agents, one pipeline

```
Stage 1+2 (parallel):
  Data Quality Agent    → validates data integrity, runs CBN compliance check via MCP
  Business Analysis     → assesses health score, calls MCP for sector benchmarks

Stage 3:
  Risk Assessment Agent → challenges Business Analyst, gets portfolio default rates via MCP

Stage 3b/3c (conditional — only fires when agents disagree):
  Business Analysis (rebuttal)  → defends or concedes
  Risk Assessment (verdict)     → issues final risk position

Stage 4 (skipped if very high risk):
  Financing Structure   → computes Murabaha terms from merchant's GTV

Stage 5:
  Human Review Agent   → synthesises full debate → approved / rejected / clarification
```

In parallel, a single-agent baseline runs the same data through one LLM call. The UI shows both results side by side so the difference is immediate and visible.

### MCP integration

A dedicated MCP server (Model Context Protocol, `@modelcontextprotocol/sdk`, stdio transport) runs alongside the Express API and exposes three tools that agents call during reasoning:

**`check_cbn_compliance`** (called by Data Quality Agent)
Checks merchant against CBN/EFCC watchlist and restricted sector list before any underwriting begins. A flagged merchant blocks the pipeline immediately.

**`get_industry_benchmarks`** (called by Business Analysis Agent)
Returns sector-specific averages — monthly GTV, active days, order completion rates — and places this merchant relative to sector peers. The agent uses this to distinguish "low active days because the business is dying" from "low active days because this is a school between terms."

**`get_sector_default_rate`** (called by Risk Assessment Agent)
Returns Zalyx's historical default rates for this exact sector + risk tier combination, and suggests a minimum Murabaha profit margin based on portfolio data. The Risk Agent uses this to ground its challenge in real numbers, not generic caution.

### Qwen Cloud API usage

- **DashScope-compatible chat completions** — all model-backed agents call Qwen Cloud through `utils/qwen-client.ts`
- **Structured Qwen calls plus deterministic money policy** — Data Quality, Business Analysis, Risk Assessment, Financing Structure, and Human Review use typed Qwen tool calls (`submit_data_quality_result`, `submit_business_position`, `submit_risk_verdict`, `structure_murabaha_offer`, `issue_underwriting_decision`). The approved Murabaha min/max range is computed by policy code, not selected by the model.
- **SSE streaming** — the frontend consumes a live stream of agent progress events as each stage completes, so users watch the debate unfold in real time rather than waiting for a full result

### Murabaha financing logic

The financing amount is not derived from merchant revenue. It is what Zalyx decides to extend, anchored to the merchant's GTV:

```
Max sale price = risk_tier_pct × avg monthly GTV
                 (25% low risk / 15% moderate / 5% high)
Min sale price = 50% of max sale price
Cost price     = selected sale price × (1 − profit margin)
                 (10% / 15% / 20% by tier)
Installment    = selected sale price ÷ tenor months
Affordability cap: installment ≤ 20% of monthly GTV
```

A merchant doing ₦10M/month at moderate risk gets a maximum sale price cap of ₦1.5M and a minimum selectable sale price of ₦750k. Zalyx buys the selected asset at cost price and sells to the merchant at the selected fixed sale price — the difference is Zalyx's disclosed profit, not interest. This avoids a model-picked “lotto” amount: the agent explains risk, while the deterministic policy defines the approved range.

The range is issued on a monthly review cadence using the latest completed monthly data period. Within that period, rerunning the agents should explain the same approved range; the offer changes only when merchant data refreshes, risk policy changes, or a new review window opens.

---

## What the multi-agent approach produces differently

The point of multi-agent underwriting is not always a different *outcome* — it is a different *quality of decision*. A single LLM call can reach the same approval or rejection the debate reaches, but it cannot show its work, surface the disagreement, or produce an auditable rationale that a compliance officer can stand behind.

**ZALYX-001 (school)**
Both approaches may reach approval. What differs: the single agent produces one paragraph of reasoning. The multi-agent pipeline produces a formal `DebateResolution` record showing *why* the Business Analyst defended the term-fee seasonality pattern, *why* the Risk Agent accepted it, and *what disbursement conditions were negotiated*. The `observability` object records every Qwen call and MCP lookup. A loan officer can read the transcript and understand exactly how the decision was reached.

**ZALYX-002 (natural products)**
A low-volume merchant with limited platform history. Single agent hedges with "requires clarification". The multi-agent pipeline reaches the same decision, but produces a stronger artifact: sector benchmark evidence, explicit risk factors, and a deterministic range that remains pending until clarification is resolved.

**ZALYX-003 (freelancer)**
The baseline hedges because the profile has weak recent activity and high receivables pressure. The multi-agent pipeline is more decisive: it rejects the application because zero recent active days and high sector default-rate evidence are not enough for a defensible approval. A generic paragraph is not useful to the merchant or to a compliance audit; a structured rejection with evidence is.

**The measurable efficiency gain (Track 3) — committed results in `benchmark/results.md`**

| Metric | Baseline | Multi-Agent |
|---|---|---|
| Decisions (all 3 merchants) | requires-clarification × 3 | **approved × 1 / clarification × 1 / rejected × 1** |
| Structured output completeness | ~50% (prose only) | **100%** |
| Actionability score | — | **73/100** |
| Risk factors surfaced | unstructured prose | **12 structured items** |
| Debate round fired | N/A | **1/3** merchants |
| Qwen calls | 1 | 2–4 per merchant (5-agent path, debate only when needed) |
| MCP calls | 0 | 3 (CBN + sector benchmarks + default rate) |
| Avg latency | 0.9s | 4.0s |

The latency tradeoff is intentional: a false approval on a ₦500k Murabaha offer costs Zalyx ~₦100k in default exposure. 4.0s of structured multi-agent review with an auditable transcript is a sound tradeoff for production underwriting.

Full results: [`benchmark/results.md`](benchmark/results.md)

---

## Technical stack

| Layer | Technology |
|---|---|
| AI | Qwen Cloud (qwen-max via DashScope), function calling, SSE |
| MCP | `@modelcontextprotocol/sdk` v1.29, stdio transport, 3 tools |
| Backend | Node.js, Express, TypeScript |
| Frontend | React 19, Vite, react-router-dom, SSE consumer |
| Persistence | Alibaba Cloud Tablestore (`utils/tablestore.ts`) — mock-first local fallback |
| Infrastructure | Docker, Alibaba Cloud ECS |

---

## Judging criteria

### Technical Depth (30%)

- **Five-agent pipeline with conditional debate.** Stages 1–5 with a debate round (3b/3c) that only fires on genuine agent disagreement — saving LLM calls on clear cases while ensuring contested applications get full adversarial review.
- **Qwen function calling on every agent.** All five agents use typed Qwen tool calls (`submit_data_quality_result`, `submit_business_position`, `submit_risk_verdict`, `structure_murabaha_offer`, `issue_underwriting_decision`). No string parsing; final financing amounts are deterministic monthly policy outputs.
- **MCP integration.** A dedicated MCP server (stdio, `@modelcontextprotocol/sdk`) exposes three live-lookup tools that agents call during reasoning — not pre-loaded context but dynamic lookups that change what agents say.
- **Alibaba Cloud Tablestore.** `utils/tablestore.ts` implements a production-grade persistence layer with two tables (`zalyx_merchants`, `zalyx_decisions`) and a global secondary index (`decision_index` on decision + createdAt) for efficient decision-type queries. The client is mock-first: it auto-detects credential presence and falls back to local JSON, so the demo runs credential-free.
- **Deterministic DebateLedger.** The `DebateModerator` (no LLM call) parses debate transcripts into typed `DebateClaim[]` objects — each with `claimId`, evidence, and resolution type — making agent negotiation machine-readable and auditable.

### Innovation (30%)

- **Agent debate as underwriting infrastructure.** The conditional debate pattern (fire only when agents disagree) is not a demo gimmick — it is a sound architecture for production decisions where false approvals carry real financial cost (₦100k default exposure on a ₦500k offer).
- **Halal-finance Murabaha engine.** The financing structure is not a loan. Zalyx buys the asset at cost price and sells it at a fixed sale price — no interest, no compounding. The Murabaha engine (`utils/murabaha-engine.ts`) is risk-tier-aware, GTV-anchored, and enforces a 20% installment affordability cap.
- **Mock-first persistence.** Alibaba Cloud Tablestore activates from environment variables with zero code changes. This pattern lets the same codebase serve local demos, CI, and production without feature flags or mocks embedded in business logic.

### Problem Value (25%)

Zalyx serves 700+ Nigerian merchants. The underwriting challenge described here is real: the same revenue data looks different depending on what you're looking for. A school with ₦2M/month average GTV but only 7 active days looks like churn — until you understand that school term fees are collected twice a year in large batches. A single LLM call does not catch this. A debate surfaces it.

The multi-agent pipeline produces decisions that a compliance officer can stand behind: a formal `DebateResolution` record, typed `DebateLedger` claims, a Murabaha installment schedule, and `RunObservability` for every run. The baseline produces a paragraph.

### Presentation (15%)

- This document.
- Architecture diagram: [`architecture.svg`](architecture.svg).
- Benchmark results: `benchmark/results.md` (committed — reproducible with `yarn benchmark`).
- Live demo: http://139.129.19.5:3001/
- Health proof: http://139.129.19.5:3001/api/health

---

## Alibaba Cloud deployment

**Alibaba Cloud code file (required proof):** `utils/tablestore.ts`
This file implements the full Tablestore client: table/index provisioning, merchant reads, decision writes, GSI queries by decision type. It is the Alibaba Cloud data layer for the application.

**Live deployment:** http://139.129.19.5:3001/

**Live health:** http://139.129.19.5:3001/api/health

**Tablestore provisioning:** Tables and the `decision_index` GSI are created automatically on first run when `OTS_*` credentials are present. No manual DDL required.

**Deploy target — Dockerfile:**

```bash
# On Alibaba Cloud ECS (Ubuntu 22.04):
curl -fsSL https://get.docker.com | sh
git clone https://github.com/alateefah/zalyx-agent-society.git
cd zalyx-agent-society
cp .env.example .env
# Edit .env: set QWEN_API_KEY and OTS_* vars
docker compose up -d --build
curl http://localhost:3001/api/health
```

The `Dockerfile` builds a single image containing the Express API, MCP server, and compiled frontend. `docker-compose.yml` wires the service with env-var injection for Qwen Cloud and Alibaba Cloud Tablestore. Health check: `GET /api/health` reports each layer's provider and mode. The live ECS deployment currently reports:

- `ai.provider: "Qwen Cloud"`
- `ai.mockMode: false`
- `database.provider: "Alibaba Cloud Tablestore"`
- `database.instance: "zalyx-agent-db"`
- `database.mockMode: false`

---

## Real-world context

This is not a demo built for the hackathon. Zalyx serves 700+ Nigerian merchants and the underwriting problem described here is real. The merchant snapshots use anonymized but real transaction data. The Murabaha structure reflects Zalyx's actual financing model. The CBN compliance requirement is a real Nigerian regulatory concern.

The agent society pattern is the right architecture for this problem because underwriting is adversarial by nature — optimists and skeptics need to argue, and the truth usually lives in the resolution of that argument.

---

## Repository

[github.com/alateefah/zalyx-agent-society](https://github.com/alateefah/zalyx-agent-society)

**Live demo:** http://139.129.19.5:3001/

**Live health:** http://139.129.19.5:3001/api/health

**Benchmark results:** See `benchmark/results.md` after running `yarn benchmark`.
