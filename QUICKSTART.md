# Quick Start Guide - Zalyx Agent Society

## Before You Start

1. **Sign up for Qwen Cloud** (if not done): https://www.qwencloud.com/challenge/hackathon/voucher-application
2. **Get your API key** from the Qwen Cloud dashboard
3. **Have Node.js 18+** installed

## Setup (5 minutes)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/zalyx-agent-society.git
cd zalyx-agent-society

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Add your Qwen Cloud API key to .env
# Open .env and fill in:
# QWEN_API_KEY=your_key_here
```

## Running the Demo

```bash
# Run the demo (generates synthetic merchant data and runs underwriting)
npm run demo

# This will:
# - Create 3 synthetic merchants
# - Run the full agent society workflow on the first merchant
# - Print a formatted report to console
# - Save JSON reports to /data folder
```

## What to Expect

When you run `npm run demo`, you'll see output like:

```
📊 Starting underwriting for Urban Retail Store...
🔍 Stage 1: Data Quality Assessment
   ✓ Data Quality Score: 85.3/100
📈 Stage 2: Business Analysis
   ✓ Business Health Score: 72.1/100
   💬 Strong candidate for financing
⚠️  Stage 3: Risk Assessment
   ✓ Risk Score: 65.4/100 (low concentration risk)
   💬 Moderate risk, recommend additional review
🤝 DEBATE: Business Agent bullish, Risk Agent cautious - will be reconciled in financing structure
💰 Stage 4: Financing Structure Design
   ✓ Proposed Amount: 180000.50
   ✓ Terms: Standard payments with seasonal adjustment
👤 Stage 5: Human Review & Final Decision
   ✓ Final Decision: APPROVED
   ✓ Approved Amount: 180000.50

═══════════════════════════════════════════════════════
[FORMATTED REPORT WITH ALL DETAILS]
═══════════════════════════════════════════════════════
```

## Project Structure

```
zalyx-agent-society/
├── agents/
│   ├── data-quality-agent.ts
│   ├── business-analysis-agent.ts
│   ├── risk-assessment-agent.ts
│   ├── financing-structure-agent.ts
│   └── human-review-agent.ts
├── orchestration/
│   └── agent-orchestrator.ts       # Coordinates agents
├── utils/
│   ├── qwen-client.ts              # Qwen API wrapper
│   └── types.ts                    # Type definitions
├── demo/
│   └── sample-run.ts               # Demo script
├── docs/
│   ├── ARCHITECTURE.md             # System design
│   └── AGENT_ROLES.md              # Agent responsibilities
├── data/
│   ├── sample-merchants/           # Synthetic data
│   └── schemas/                    # Data validation
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Key Files to Review

1. **orchestration/agent-orchestrator.ts** — How agents are orchestrated
2. **agents/*.ts** — Each agent's implementation
3. **docs/ARCHITECTURE.md** — Full system design
4. **docs/AGENT_ROLES.md** — What each agent does

## For the Hackathon Demo

When creating your 3-minute demo video:

1. Show the synthetic merchant data (don't use real data)
2. Run `npm run demo` and screen-record the output
3. Explain the 5 stages:
   - Data Quality
   - Business Analysis
   - Risk Assessment (emphasize the debate)
   - Financing Structure
   - Human Review (final decision)
4. Highlight the **agent disagreement** — this is the key innovation

## Troubleshooting

**"QWEN_API_KEY is not defined"**
→ Check your .env file has QWEN_API_KEY set

**"Cannot find module 'openai'"**
→ Run `npm install` to install dependencies

**"API error from Qwen"**
→ Check API key is correct and you have credits remaining

## Next Steps

1. Customize synthetic data in `/demo/sample-run.ts` if needed
2. Run locally to test agents are working
3. Record demo video showing agents in action
4. Prepare architecture diagram (reference: docs/ARCHITECTURE.md)
5. Write final submission description highlighting:
   - Agent debate mechanism
   - Real problem (transparent merchant lending)
   - Multi-perspective advantage

## Questions?

- **Qwen Cloud support**: Qwen Cloud Discord
- **Technical issues**: Check docs/ARCHITECTURE.md
- **Running locally**: See this guide

Good luck! 🚀
