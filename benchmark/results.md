# Zalyx Agent Society — Benchmark Results

**Run date:** 2026-07-02
**Mode:** Mock Mode
**Merchants:** 3 (ZALYX-001, ZALYX-002, ZALYX-003)

## 1. Decision Comparison

| Merchant | Type | Baseline Decision | Baseline Confidence | Multi-Agent Decision | Decisions Differ? |
|---|---|---|---|---|---|
| ZALYX-001 | School | requires-clarification | 80% | approved | **Yes** |
| ZALYX-002 | Natural Skin & Hair Products | requires-clarification | 70% | requires-clarification | No |
| ZALYX-003 | Freelancer | requires-clarification | 60% | rejected | **Yes** |

## 2. Latency

| Merchant | Baseline | Multi-Agent | Multi-Agent Overhead |
|---|---|---|---|
| ZALYX-001 | 0.9s | 5.5s | +4.6s |
| ZALYX-002 | 0.9s | 4.0s | +3.1s |
| ZALYX-003 | 1.0s | 2.5s | +1.5s |

## 3. Risk Coverage & Agent Activity

| Merchant | Data Quality | Health Score | Risk Score | Risk Factors | Debate Fired | Agent Stages | Structured Qwen Calls |
|---|---|---|---|---|---|---|---|
| ZALYX-001 | 90/100 | 68/100 | 50/100 | 4 | **Yes** | 7 | 4 |
| ZALYX-002 | 90/100 | 55/100 | 35/100 | 2 | No | 5 | 3 |
| ZALYX-003 | 90/100 | 36/100 | 95/100 | 6 | No | 4 | 2 |

## 4. Output Quality

| Merchant | Structured Completeness | Actionability Score | Rationale Words (Multi) | Rationale Words (Baseline) | Depth Gain |
|---|---|---|---|---|---|
| ZALYX-001 | 100% | 100/100 | 142 | 70 | +72 words |
| ZALYX-002 | 100% | 60/100 | 37 | 70 | -33 words |
| ZALYX-003 | 100% | 60/100 | 38 | 70 | -32 words |

## 5. Summary

| Metric | Value |
|---|---|
| Merchants benchmarked | 3 |
| Decisions that differed (baseline vs multi-agent) | 2/3 |
| Debate round fired | 1/3 merchants |
| Total risk factors surfaced across all merchants | 12 |
| Avg structured output completeness | 100% |
| Avg actionability score | 73/100 |
| Avg baseline latency | 0.9s |
| Avg multi-agent latency | 4.0s |
| Latency tradeoff per merchant | +3.1s for structured debate |

> **Why the overhead is worth it in underwriting:**
> A false approval on a ₦500k Murabaha offer costs Zalyx ~₦100k+ in default exposure.
> A false rejection costs a merchant a financing opportunity and Zalyx a transaction fee.
> 4.0s of compute to surface 4 structured risk factors per merchant,
> trigger a formal debate when agents disagree, and produce a decision that can be
> audited by a compliance officer is a sound tradeoff for production underwriting.