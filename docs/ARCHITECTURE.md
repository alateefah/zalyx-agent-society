# Zalyx Agent Society - Architecture

## Overview

Zalyx Agent Society implements a multi-agent underwriting system where specialized AI agents collaborate, debate, and negotiate financing decisions for merchant lending.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Qwen Cloud API                    │
│  (OpenAI-compatible, function calling enabled)     │
└─────────────────────────────────────────────────────┘
                          ↑
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
    [Agent Orchestrator]            [LangGraph Workflow]
        (Controls flow)               (State management)
        ↑                                   ↑
        └─────────────────┬─────────────────┘
                          ↓
          ┌───────────────────────────────┐
          │    Specialized Agents:        │
          ├───────────────────────────────┤
          │ • Data Quality Agent          │
          │ • Business Analysis Agent     │
          │ • Risk Assessment Agent       │
          │ • Financing Structure Agent   │
          │ • Human Review Agent          │
          └───────────────────────────────┘
                          ↑
              ┌───────────────────────┐
              │   Merchant Data       │
              │   (Anonymized)        │
              └───────────────────────┘
                          ↓
              ┌───────────────────────┐
              │   Output Report:      │
              │ • Scores              │
              │ • Debate Transcript   │
              │ • Final Recommendation│
              └───────────────────────┘
```

## Workflow Stages

### Stage 1: Data Quality Assessment
**Agent:** `DataQualityAgent`
- Validates merchant data completeness
- Checks for consistency issues
- Identifies anomalies (unusual transactions, gaps)
- Produces: Data quality score (0-100)

### Stage 2: Business Analysis
**Agent:** `BusinessAnalysisAgent`
- Analyzes revenue trends
- Calculates business health metrics
- Evaluates profitability
- Produces: Business health score (0-100)
- First recommendation: "Approve/Moderate/Reject"

### Stage 3: Risk Assessment
**Agent:** `RiskAssessmentAgent`
- Independently evaluates risk factors
- Calculates volatility index
- Assesses concentration risk
- **Can disagree with Business Analysis Agent** ← This is the key feature
- Produces: Risk score (0-100)
- Second recommendation: "Low risk/Moderate/High risk"

**Debate Point:** If Business Agent says "Healthy" (score 75+) but Risk Agent says "High volatility," the system captures this disagreement for later synthesis.

### Stage 4: Financing Structure
**Agent:** `FinancingStructureAgent`
- Takes input from both business and risk analyses
- Designs financing terms
- Proposes amount based on revenue × health multiplier × risk adjustment
- Determines repayment schedule
- Produces: Proposed amount, terms, payment schedule

### Stage 5: Human Review
**Agent:** `HumanReviewAgent`
- Synthesizes all agent outputs
- Analyzes disagreements
- Produces final underwriting decision
- Adjusts terms based on risks identified
- Outputs: APPROVED / REJECTED / REQUIRES-CLARIFICATION

## Key Design Decisions

### 1. Agent Independence
Each agent evaluates the merchant independently before seeing other agents' outputs. This prevents bias and ensures diverse perspectives.

### 2. Debate Mechanism
The `debateTranscript` captures each agent's analysis and recommendation. Conflicts are explicitly noted:
- "Business Agent recommends approval; Risk Agent flags volatility"
- These disagreements drive better decision-making

### 3. Staged Evaluation
Agents run sequentially (not in parallel) so each can see prior context:
- Data Quality → Business Analysis → Risk → Structure → Human Review

### 4. Proprietary Logic vs. Open Architecture
- **Open:** Agent framework, orchestration, message passing
- **Proprietary:** Exact scoring formulas (abstracted as Qwen API calls)

## Data Structures

### Input: MerchantData
```typescript
{
  id: string,
  businessName: string,
  businessType: string,
  registrationDate: string,
  transactions: [{
    date: string,
    amount: number,
    type: "income" | "expense",
    description: string
  }]
}
```

### Output: UnderwritingReport
```typescript
{
  merchantId: string,
  executionTime: string,
  dataQuality: DataQualityResult,
  businessAnalysis: BusinessAnalysisResult,
  riskAssessment: RiskAssessmentResult,
  financingStructure: FinancingStructureResult,
  humanReview: HumanReviewResult,
  debateTranscript: AgentDebateMessage[]
}
```

## How Disagreement is Handled

**Example:**
1. Business Analysis Agent: "Merchant is healthy. Revenue stable. Recommend approval for ₦500K."
2. Risk Assessment Agent: "Revenue appears stable BUT shows seasonal patterns. Q4 shows 40% dip. Recommend lower amount or flexible terms."
3. Financing Structure Agent: Proposes ₦350K with seasonal flexibility
4. Human Review Agent: "Approves ₦400K with Q4 payment flexibility"

The system makes better decisions than a single agent because:
- Risk Agent catches seasonal patterns Business Agent might miss
- Business Agent's optimism is balanced by Risk Agent's conservatism
- Final terms reflect both perspectives

## Integration with Qwen Cloud

The system uses Qwen Cloud's OpenAI-compatible API for:
- Natural language analysis of financial data
- Generating agent recommendations
- Synthesizing debate into final decisions

Each agent calls Qwen with:
1. System prompt defining their role
2. Current merchant data
3. Request for analysis/recommendation

## Extensibility

To add new agents:
1. Create `new-agent.ts` in `/agents` folder
2. Implement interface with `evaluate()` method
3. Add to `AgentOrchestrator.runUnderwriting()`
4. Return `{ result, debateMessage }`

Example: Credit History Agent, Market Analysis Agent, Compliance Check Agent, etc.

## Performance

- Typical underwriting: 30-60 seconds
- Bottleneck: Qwen API latency (not local processing)
- Can be optimized with parallel agent evaluation (currently sequential for clarity)
