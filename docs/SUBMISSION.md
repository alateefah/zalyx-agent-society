# Devpost Submission — Zalyx Agent Society

> Copy the sections below into Devpost. Replace bracketed placeholders before submitting.

---

## Project Title

**Zalyx Agent Society — Multi-Agent Merchant Underwriting**

---

## Track

**Track 3: Agent Society**

---

## Text Description

### What it is

Zalyx Agent Society is a multi-agent AI system that underwrites merchant financing applications using five specialized agents that debate each case — rather than a single AI call reaching a verdict alone.

The system is built on real anonymized data from [Zalyx](https://zalyx.com), a Nigerian fintech platform serving 700+ merchants. Merchants applying for Murabaha-compliant financing deserve a decision that reflects nuance: business type, payment patterns, seasonal variation, and counterarguments — not just a raw score.

### The problem with single-agent underwriting

A single LLM call, given a merchant's revenue data, will often hedge. It sees volatile revenue and low 30-day activity and asks for clarification. It doesn't know that a school's revenue spikes at term start and drops mid-term — or that a freelancer's ₦575,000 in uncollected receivables from just-completed projects is expected, not alarming.

Zalyx Agent Society fixes this through structured debate.

### How the agent debate works

Five agents process every application in sequence:

1. **Data Quality Agent** — Validates completeness, flags data anomalies (high edit rate, backdated entries, batch-day patterns). Sets confidence level for downstream agents.

2. **Business Analysis Agent** — Calculates business health score (0–100) from revenue trajectory, order completion rate, stability, and platform activity. Makes an initial recommendation.

3. **Risk Assessment Agent** — Independently challenges the Business Agent's assessment. Identifies credit risk, revenue concentration, operational inactivity, and receivables exposure. Explicitly pushes back where the Business Agent is optimistic.

4. **Debate Round (Round 2):**
   - **Business Agent rebuts** — Defends positions with evidence, concedes where the risk officer is right, raises domain context (business type seasonality, payment norms).
   - **Risk Agent issues final verdict** — Holds firm or moderates based on the rebuttal. States specific conditions under which approval is acceptable.

5. **Financing Structure Agent** — Designs a Murabaha-compliant financing package anchored to the debate outcome: amount, fixed fee, tenor, and risk mitigations.

6. **Human Review Agent** — Synthesises the full debate transcript into a final decision (APPROVED / REJECTED / REQUIRES CLARIFICATION) with plain-English explanation for both the underwriting team and the merchant.

### Measurable efficiency gain over single-agent baseline

To satisfy Track 3's requirement for measurable comparison, the system runs a single-agent baseline in parallel with every debate. The same merchant data is sent in one comprehensive LLM call. The UI shows both outcomes side by side.

**Example — Bright Future Academy (ZALYX-001):**

| | Single Agent | 5-Agent Debate |
|---|---|---|
| Decision | REQUIRES CLARIFICATION | APPROVED with conditions |
| Reasoning | "Revenue volatile, low 30d activity" | School term-fee pattern identified; business analyst defended; risk agent moderated |
| Proposed amount | Provisional ₦150K | ₦250K with receivables covenant |
| Confidence | ~65% | ~80% |

The debate produced a more precise, justified decision. The school isn't risky because of volatile revenue — it's a school. Single agents don't ask that question.

### What was built

- **TypeScript/Node.js backend** — Express API with 5 specialized agent classes + baseline agent
- **React + Vite frontend** — Dark-mode UI with real-time processing stages, agent debate transcript with round labels, baseline comparison strip
- **Merchant snapshot format** — `ZalyaxMerchantSnapshot` type built from Zalyx's real Prisma schema (orders, receivables, eligibility signals, monthly revenue buckets)
- **Real anonymized data** — 3 merchants from the Zalyx platform with different risk profiles
- **Mock mode** — Full UI works without a Qwen API key for demonstration

### Qwen Cloud integration

All agent reasoning is powered by **Qwen Cloud** via the DashScope API (`dashscope-intl.aliyuncs.com`). The system uses Qwen's OpenAI-compatible interface, making it straightforward to configure any Qwen model (`qwen-max`, `qwen-plus`, `qwen-turbo`) via environment variable.

Each debate run makes 6 Qwen calls (one per agent stage, two for the debate round) plus 1 baseline call — 7 total, running in parallel where possible.

### Deployment

Backend deployed on **Alibaba Cloud ECS** via Docker. See [deployment instructions in README](../README.md#deploy-to-alibaba-cloud-ecs).

---

## Architecture Diagram

See [`docs/architecture.svg`](./architecture.svg) for the full system diagram.

**Summary:**
- Browser → React frontend → Express API (Alibaba Cloud ECS)
- Express → Agent Orchestrator → 5 agents in sequence (+ debate round)
- All agents → Qwen Cloud API (DashScope, Alibaba Cloud)
- Baseline agent runs in parallel via `POST /api/baseline`
- Decision + full transcript returned to frontend

---

## Alibaba Cloud Proof

**Code file demonstrating Alibaba Cloud services:**
[`utils/qwen-client.ts`](../utils/qwen-client.ts) — integrates with Qwen Cloud (DashScope) at `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`

**Deployment proof:** [LINK TO RECORDING — add before submission]

The backend is deployed on Alibaba Cloud ECS. See the recording for proof.

---

## Links

- **GitHub repository:** [YOUR_GITHUB_URL]
- **Live demo:** [YOUR_ECS_IP]:3001
- **Architecture diagram:** `docs/architecture.svg`
- **Demo video:** [YOUR_YOUTUBE_URL]

---

## Optional: Blog Post

[Add link if submitting for Blog Post Prize]

---

## Notes for judges

- Clone the repo and run `npm install && cd frontend && npm install && cd .. && npm run dev`
- The system works in **mock mode** without a Qwen API key — all 5 agents return realistic responses
- Add `QWEN_API_KEY` to `.env` for real Qwen Cloud responses
- The ZALYX-001 merchant (school) is the most illustrative demo case — run it first
- The debate round is conditional: it only triggers when there's genuine tension between Business Agent and Risk Agent (health score > 55 AND risk score > 35)
