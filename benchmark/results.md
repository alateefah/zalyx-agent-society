# Zalyx Agent Society — Benchmark Results

**Run date:** 2026-06-15
**Mode:** Mock Mode
**Merchants:** 3 (ZALYX-001, ZALYX-002, ZALYX-003)

## 1. Decision Comparison

| Merchant | Type | Baseline Decision | Baseline Confidence | Multi-Agent Decision | Decisions Differ? |
|---|---|---|---|---|---|
| ZALYX-001 | School | requires-clarification | 80% | approved | **Yes** |
| ZALYX-002 | Natural Skin & Hair Products | requires-clarification | 70% | approved | **Yes** |
| ZALYX-003 | Freelancer | requires-clarification | 60% | approved | **Yes** |

## 2. Latency

| Merchant | Baseline | Multi-Agent | Multi-Agent Overhead |
|---|---|---|---|
| ZALYX-001 | 0.5s | 5.7s | +5.2s |
| ZALYX-002 | 0.6s | 5.8s | +5.2s |
| ZALYX-003 | 0.5s | 5.4s | +4.8s |

## 3. Risk Coverage & Agent Activity

| Merchant | Data Quality | Health Score | Risk Score | Risk Factors | Debate Fired | Agent Stages | Structured Qwen Calls |
|---|---|---|---|---|---|---|---|
| ZALYX-001 | 90/100 | 65/100 | 42/100 | 3 | **Yes** | 7 | 4 |
| ZALYX-002 | 90/100 | 65/100 | 42/100 | 3 | **Yes** | 7 | 4 |
| ZALYX-003 | 90/100 | 65/100 | 42/100 | 3 | **Yes** | 7 | 4 |

## 4. Output Quality

| Merchant | Structured Completeness | Actionability Score | Rationale Words (Multi) | Rationale Words (Baseline) | Depth Gain |
|---|---|---|---|---|---|
| ZALYX-001 | 100% | 100/100 | 217 | 70 | +147 words |
| ZALYX-002 | 100% | 100/100 | 217 | 70 | +147 words |
| ZALYX-003 | 100% | 100/100 | 217 | 70 | +147 words |

## 5. Summary

| Metric | Value |
|---|---|
| Merchants benchmarked | 3 |
| Decisions that differed (baseline vs multi-agent) | 3/3 |
| Debate round fired | 3/3 merchants |
| Total risk factors surfaced across all merchants | 9 |
| Avg structured output completeness | 100% |
| Avg actionability score | 100/100 |
| Avg baseline latency | 0.5s |
| Avg multi-agent latency | 5.6s |
| Latency tradeoff per merchant | +5.1s for structured debate |

> **Why the overhead is worth it in underwriting:**
> A false approval on a ₦500k Murabaha offer costs Zalyx ~₦100k+ in default exposure.
> A false rejection costs a merchant a financing opportunity and Zalyx a transaction fee.
> 5.6s of compute to surface 3 structured risk factors per merchant,
> trigger a formal debate when agents disagree, and produce a decision that can be
> audited by a compliance officer is a sound tradeoff for production underwriting.