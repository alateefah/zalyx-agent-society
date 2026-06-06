# Zalyx Agent Society

**Multi-agent underwriting system for halal merchant financing**

A collaborative AI system where multiple agents debate, challenge, and negotiate financing decisions for underserved small businesses. Built for the Qwen Cloud Hackathon (Track 3: Agent Society).

## Problem

Small business owners in underserved markets lack access to fair capital because:
- Limited formal financial records
- Insufficient credit history with institutions
- Opaque lending criteria (why you're rejected is a mystery)
- No room for human judgment in automated systems

Current fintech underwriting is a **black box**: AI model says yes or no, merchants get no insight into *why*. This is especially problematic in culturally-sensitive contexts (Islamic finance requires transparency).

## Solution: Multi-Agent Underwriting with Transparency

Instead of a single AI model making a yes/no decision, multiple specialized agents *debate* before a final recommendation:

```
Merchant Data (Anonymized Transaction Records)
    ↓
[Data Quality Agent] — validates data completeness, flags quality issues
    ↓
[Business Analysis Agent] — assesses business performance metrics
    ↓
[Risk Assessment Agent] — independently evaluates risk factors
    ↓
[Financing Structure Agent] — designs compliant financing terms
    ↓
[Human Review Agent] — synthesizes debate, produces final recommendation
```

### Why Agents > Single AI Model

| Aspect | Single Agent | Multi-Agent |
|--------|------------|------------|
| **Transparency** | "Yes or no" | "Agent A recommends conservative terms, Agent B identifies growth opportunity" |
| **Risk Detection** | May miss edge cases | Debate surfaces blind spots and conflicting signals |
| **Explainability** | Black box | Clear disagreement trail shows reasoning |
| **Domain Expertise** | Generic reasoning | Each agent specialized in specific domain |
| **Fairness & Bias** | One perspective | Multiple perspectives challenge assumptions |

## Demo

**Input:** Anonymized merchant transaction records (payment history, frequency, consistency)

**Output:**
1. Data quality assessment
2. Business performance evaluation
3. Risk analysis report
4. Financing structure recommendation
5. **Debate transcript** (showing agent disagreements and reasoning)
6. Final recommendation for human review

**Example Agent Dialogue:**
```
Data Quality Agent: "Data passes quality checks. 95% record completeness."

Business Analysis Agent: "Merchant shows consistent monthly activity 
over 8+ month period. Revenue trajectory is stable."

Risk Assessment Agent: "Agrees on stability, but flagged: seasonal 
revenue dip in Q4. Recommend conservative structure with flexibility."

Financing Structure Agent: "Proposes structure with adaptive repayment 
terms to accommodate seasonal variations."

Human Review: "Approved with quarterly adjustment clauses."
```

**Key Feature:** Merchants understand *why* they received financing terms, not just a yes/no.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Qwen Cloud API                    │
│  (Qwen Max / Plus with function calling enabled)   │
└─────────────────────────────────────────────────────┘
                          ↑
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
    [Agent                             [Agent
     Orchestration]                    Reasoning]
        ↑                                   ↑
        └─────────────────┬─────────────────┘
                          ↓
              ┌───────────────────────┐
              │   Merchant Data       │
              │   (Anonymized)        │
              └───────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   Output: Financing   │
              │   Recommendation +    │
              │   Debate Transcript   │
              └───────────────────────┘
```

## Tech Stack

- **Language:** TypeScript / Node.js
- **LLM:** Qwen (via Qwen Cloud API)
- **Agent Framework:** LangGraph (for workflow orchestration)
- **Data:** Merchant transaction records (anonymized)
- **Infrastructure:** Alibaba Cloud / Qwen Cloud
- **Frontend:** JSON output + optional CLI visualization

## Getting Started

### Prerequisites
- Node.js 18+
- Qwen Cloud account + API key
- Git

### Installation

```bash
git clone https://github.com/yourusername/zalyx-agent-society.git
cd zalyx-agent-society
npm install
```

### Configuration

Create a `.env` file:
```
QWEN_API_KEY=your_qwen_cloud_api_key
QWEN_MODEL=qwen-max  # or qwen-plus
```

### Running the System

```bash
# Process merchant data and run agent society
npm run demo

# Output: agent debate transcript + financing recommendation
```

## Project Structure

```
zalyx-agent-society/
├── agents/
│   ├── data-quality-agent.ts        # Validates input data
│   ├── business-analysis-agent.ts   # Analyzes merchant metrics
│   ├── risk-assessment-agent.ts     # Evaluates risk factors
│   ├── financing-structure-agent.ts # Designs financing terms
│   └── human-review-agent.ts        # Compiles recommendations
├── orchestration/
│   ├── agent-graph.ts               # LangGraph workflow definition
│   └── message-types.ts             # Inter-agent communication protocol
├── data/
│   ├── sample-merchants/            # Synthetic merchant data examples
│   └── schemas/                     # Input/output data schemas
├── utils/
│   ├── qwen-client.ts               # Qwen API wrapper
│   └── formatting.ts                # Output formatting utilities
├── demo/
│   └── sample-run.ts                # Example workflow execution
├── docs/
│   ├── ARCHITECTURE.md              # System design overview
│   └── AGENT_ROLES.md               # Agent responsibilities & interfaces
├── .env.example
├── package.json
└── README.md
```

## Data & Proprietary Logic

This project uses **synthetic merchant data** in the public repository. Actual scoring algorithms and underwriting logic are abstractions that interface with proprietary evaluation systems. This ensures:
- Full transparency into *how agents collaborate*
- Privacy of competitive scoring methodologies
- Reproducibility with open synthetic data
- Clear separation of agent architecture (open) from domain logic (proprietary)

## Real-World Application

This project demonstrates agent-based underwriting for a production fintech platform serving underserved merchant markets. The system is designed to:
- Replace opaque black-box lending decisions with explainable agent debates
- Support Shariah-compliant (halal) financing structures
- Provide transparency to merchants about why they receive certain terms
- Build credit history from transaction data for underbanked populations

Agent Society is the next phase of this platform:
1. ✅ Foundational data layer (live)
2. 🔄 **Agentic underwriting** (this hackathon)
3. ⏳ Structured financing products (post-hackathon)
4. ⏳ Credit scoring APIs (future)

## Hackathon Track: Agent Society

This submission demonstrates key requirements for Track 3:
- **Task Decomposition:** Each agent handles a distinct evaluation domain
- **Role Specialization:** Agents have specific expertise (data quality, risk, structuring)
- **Agent Dialogue:** Agents review each other's recommendations and debate
- **Disagreement Resolution:** Human review agent synthesizes debate into final decision
- **Multi-Agent Advantage:** Transparent debate produces better decisions than single-agent baseline

## Judging Criteria Alignment

| Criterion | How We Address It |
|-----------|-----------------|
| **Technical Depth (30%)** | Multi-agent orchestration, Qwen function calling, LangGraph workflow state management, agent message protocols |
| **Innovation (30%)** | Novel application of agents to financial decision-making, transparent debate mechanisms, domain-specific agent roles |
| **Problem Value (25%)** | Real-world problem (transparent lending), scalable architecture, applicable to multiple fintech domains |
| **Presentation (15%)** | Clear architecture diagram, debate transcript visualization, comprehensive documentation

## Next Steps (Post-Hackathon)

- [ ] Scale to full agent ecosystem (AI CFO, payment flow agents)
- [ ] Production-grade error handling & monitoring
- [ ] Merchant-facing dashboard
- [ ] API for third-party merchant platforms
- [ ] Regulatory compliance layer (Nigeria fintech rules)

## Contributing

This is a hackathon project. Ideas, issues, and PRs welcome after submission.

## License

MIT License — see [LICENSE](LICENSE) file

## Questions?

- **Hackathon Help:** Qwen Cloud Discord (https://discord.gg/cDEHSV4Qqj)
- **Agent Architecture:** See `docs/ARCHITECTURE.md`
- **Technical Issues:** Open an issue in this repository

---

**Built for Qwen Cloud Hackathon 2026**  
**Track:** Agent Society | **Status:** Active Development
