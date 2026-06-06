# Agent Roles & Responsibilities

## Overview

Each agent in Zalyx Agent Society has a distinct domain expertise and perspective. Agents collaborate through a structured debate process.

---

## 1. Data Quality Agent

**Role:** Data Auditor

**Responsibilities:**
- Validate merchant data completeness
- Check for internal consistency
- Detect anomalies (unusual transactions, gaps, outliers)
- Flag data quality issues that affect analysis reliability

**Key Metrics:**
- Completeness score (0-100)
- Consistency score (0-100)
- Anomaly count
- Overall quality score

**Success Criteria:**
- Identifies 100% of major data issues
- Provides clear, actionable feedback on data fitness

**Input:** Raw merchant transaction data
**Output:** Data quality assessment + confidence score

**Example Flags:**
- "Missing transaction data from Q2"
- "Single transaction worth 5x average amount"
- "80-day gap in transaction history"

---

## 2. Business Analysis Agent

**Role:** Financial Analyst

**Responsibilities:**
- Analyze revenue trends and patterns
- Calculate business viability metrics
- Assess profitability and sustainability
- Generate initial financing recommendation
- Provide context for financing decisions

**Key Metrics:**
- Monthly revenue average
- Revenue stability (0-100)
- Transaction frequency
- Profit margin
- Business health score (0-100)

**Success Criteria:**
- Accurately identifies stable vs. volatile businesses
- Provides clear business viability assessment
- Generates reasonable initial financing recommendations

**Input:** Merchant data, Data Quality assessment
**Output:** Business health score + initial recommendation

**Example Output:**
- "Strong monthly revenue of ₦50K with 85% consistency"
- "Recommended financing: ₦200K based on 6-month revenue"

---

## 3. Risk Assessment Agent

**Role:** Risk Officer

**Responsibilities:**
- Independently evaluate risk factors
- Challenge assumptions from Business Analysis Agent
- Calculate volatility and concentration risk
- Identify operational stability issues
- Provide conservative perspective

**Key Metrics:**
- Volatility index (0-100, higher = riskier)
- Concentration risk (high/medium/low)
- Operational stability (0-100)
- Overall risk score (0-100)

**Success Criteria:**
- Identifies businesses with hidden risks
- Catches seasonal patterns and volatility
- Provides conservative but fair assessments

**Input:** Merchant data, Data Quality + Business Analysis
**Output:** Risk assessment + cautionary perspective

**Example Disagreement:**
- Business Agent: "Stable business ✓"
- Risk Agent: "WAIT—Q4 shows 40% revenue drop. Seasonal volatility detected. ⚠️"

**Agent's Specialty:** Disagreeing with optimistic assumptions

---

## 4. Financing Structure Agent

**Role:** Fintech Structuring Specialist

**Responsibilities:**
- Design appropriate financing terms
- Calculate financing amount based on multiple factors
- Determine repayment schedules
- Identify risk mitigations
- Ensure compliance with Islamic finance principles

**Key Metrics:**
- Proposed financing amount
- Repayment terms (months, structure type)
- Payment schedule clarity
- Risk mitigation strategies

**Success Criteria:**
- Balances merchant affordability with lender protection
- Proposes realistic repayment structures
- Incorporates flexibility for volatile businesses

**Input:** Merchant data, Business + Risk assessments
**Output:** Financing proposal (amount, terms, schedule)

**Formula:**
```
Base Amount = Monthly Revenue × (3 to 6) × Health Multiplier
Adjusted Amount = Base Amount × Risk Adjustment Factor
```

**Example Output:**
- "Proposed: ₦350K"
- "Terms: 12-month repayment"
- "Schedule: ₦29,167/month with Q4 flexibility"
- "Mitigations: Flexible payment terms, quarterly reviews"

---

## 5. Human Review Agent

**Role:** Final Arbitrator

**Responsibilities:**
- Synthesize all agent outputs
- Analyze disagreements between agents
- Make final underwriting decision
- Adjust terms for fairness and risk management
- Provide clear reasoning to merchant

**Key Metrics:**
- Final recommendation (APPROVED/REJECTED/REQUIRES-CLARIFICATION)
- Approval amount
- Terms adjustments
- Confidence score

**Success Criteria:**
- Makes fair decisions reflecting all perspectives
- Clearly explains reasoning
- Balances risk management with merchant inclusion

**Input:** All agent outputs + debate transcript
**Output:** Final underwriting decision + explanation

**Decision Logic:**
```
IF data_quality < 40:
  → REQUIRES-CLARIFICATION
ELSE IF health > 70 AND risk < 40:
  → APPROVED
ELSE IF health > 50 AND risk < 70:
  → APPROVED (with terms adjustments)
ELSE:
  → REJECTED
```

**Example Output:**
```
APPROVED: ₦350K with terms adjustments
Reason: Business shows strong fundamentals (health: 75/100) but seasonal 
volatility (risk: 65/100) warrants flexible payment schedule. Approved amount 
reflects conservative structuring while supporting merchant growth.
Adjustments: Implement flexible Q4 payments; quarterly business reviews
```

---

## Agent Debate Example

```
Merchant: Urban Retail Store
Business Type: Retail
Data Quality: 80/100
Business Health: 72/100 ✓ (Appears healthy)
Risk Score: 68/100 ⚠️ (Concerning volatility)

DEBATE TRANSCRIPT:

1. DATA QUALITY AGENT
   "Data is mostly complete (80/100). Anomaly: One large transaction 
   in January. Otherwise consistent."

2. BUSINESS ANALYSIS AGENT
   "Monthly revenue averaging ₦45K, stable patterns. Business health: 
   72/100. Recommend: APPROVE for ₦250K"

3. RISK ASSESSMENT AGENT
   "HOLD. I see seasonal volatility. Revenue spikes in Dec-Jan 
   (holiday season) then drops 35% in March-April. This isn't stable 
   income. Risk: HIGH. Recommend: CONSERVATIVE STRUCTURE"

4. FINANCING STRUCTURE AGENT
   "Agree with Risk Agent. Propose ₦200K instead of ₦250K. Payment 
   terms: ₦20K/month, but reduce to ₦15K in March-May to match 
   low season."

5. HUMAN REVIEW AGENT
   "Final Decision: APPROVED ₦200K with flexible repayment
   Reasoning: Business is viable but seasonal. Flexible terms protect 
   both merchant and lender. Quarterly reviews recommended."
```

---

## How Agents Interact

1. **Sequential Flow:** Data Quality → Analysis → Risk → Structure → Human Review
2. **Information Sharing:** Each agent sees prior outputs
3. **Independence:** Agents analyze independently BEFORE seeing others' conclusions
4. **Debate:** Risk Agent specifically encouraged to challenge Business Agent
5. **Synthesis:** Human Review Agent resolves disagreements

## Extensibility

To add new agents, implement this interface:

```typescript
interface Agent {
  agentName: string;
  agentRole: string;
  evaluate(...): Promise<{
    result: SpecificResult;
    debateMessage: AgentDebateMessage;
  }>
}
```

Then add to `AgentOrchestrator.runUnderwriting()` at the appropriate stage.

## Notes for Judges

- The key innovation is **agent disagreement:** Risk Agent catches risks Business Agent misses
- The **debate transcript** shows why decisions were made, not just the final answer
- This is more transparent and fair than a single AI model
- The system is designed to catch edge cases through multiple perspectives
