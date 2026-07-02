/**
 * Qwen Cloud Client — Alibaba Cloud DashScope API
 *
 * Capabilities:
 *   • analyzeWithContext  — standard chat completion
 *   • chatWithTools       — function calling (structured JSON output from Qwen)
 *   • withRetry           — exponential backoff retry for rate limits / transient errors
 */

import OpenAI from "openai";

const apiBase =
  process.env.QWEN_API_BASE_URL ||
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentResponse {
  message: string;
  agentName: string;
  timestamp: string;
}

export interface ToolCallResult {
  message: string;          // Qwen's prose reasoning
  agentName: string;
  timestamp: string;
  toolCall?: {              // Populated when Qwen invokes a function
    name: string;
    arguments: Record<string, unknown>;
  };
}

// ── Tool Definitions (used by function-calling agents) ────────────────────────

export const SUBMIT_RISK_VERDICT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_risk_verdict",
    description:
      "Submit your formal risk assessment verdict with structured findings. Call this after completing your analysis.",
    parameters: {
      type: "object",
      properties: {
        risk_level: {
          type: "string",
          enum: ["LOW", "MODERATE", "HIGH"],
          description: "Your overall risk classification",
        },
        adjusted_risk_score: {
          type: "number",
          description:
            "Your risk score 0-100. Use the computed baseline as a starting point; adjust based on business context.",
        },
        key_risk_factors: {
          type: "array",
          items: { type: "string" },
          description:
            "Top 2-4 specific risk factors. Cite actual numbers (e.g. '₦1.06M uncollected on 17 orders').",
        },
        challenge_to_business_analyst: {
          type: "string",
          description:
            "Your specific pushback on the Business Analyst's assessment. What did they miss or underweight?",
        },
        conditions_for_approval: {
          type: "array",
          items: { type: "string" },
          description:
            "Specific, measurable conditions under which you support approval. Empty array = recommend rejection.",
        },
      },
      required: [
        "risk_level",
        "adjusted_risk_score",
        "key_risk_factors",
        "challenge_to_business_analyst",
      ],
    },
  },
};

export const SUBMIT_DATA_QUALITY_RESULT_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_data_quality_result",
    description:
      "Submit your structured data quality assessment. Call this after reviewing all data signals.",
    parameters: {
      type: "object",
      properties: {
        completeness_score: {
          type: "number",
          description: "Score 0–100 for data completeness across all required fields.",
        },
        consistency_score: {
          type: "number",
          description: "Score 0–100 for internal consistency (e.g. orders add up, dates are logical).",
        },
        anomalies: {
          type: "array",
          items: { type: "string" },
          description:
            "List of specific anomalies found. E.g. '₦1.06M uncollected across 17 outstanding orders'. Empty if none.",
        },
        overall_quality_score: {
          type: "number",
          description: "Combined quality score 0–100. Average of completeness and consistency.",
        },
        proceed_recommendation: {
          type: "string",
          enum: ["proceed", "proceed_with_caveats", "block"],
          description:
            "Whether underwriting should proceed. Block only if data is too incomplete to assess.",
        },
        quality_notes: {
          type: "string",
          description: "One paragraph summarising data quality for subsequent agents.",
        },
      },
      required: [
        "completeness_score",
        "consistency_score",
        "anomalies",
        "overall_quality_score",
        "proceed_recommendation",
        "quality_notes",
      ],
    },
  },
};

export const SUBMIT_BUSINESS_POSITION_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_business_position",
    description:
      "Submit your structured business health assessment and position for the debate. Call this after completing your analysis.",
    parameters: {
      type: "object",
      properties: {
        monthly_revenue_average: {
          type: "number",
          description: "Average monthly revenue in naira computed from the data.",
        },
        revenue_stability_score: {
          type: "number",
          description:
            "Score 0–100 for revenue stability. 100 = perfectly stable, 0 = completely erratic.",
        },
        business_health_score: {
          type: "number",
          description:
            "Overall business health 0–100. Weight: revenue trend 40%, activity signals 30%, data quality 30%.",
        },
        profitability_indicator: {
          type: "string",
          enum: ["strong", "moderate", "weak", "insufficient_data"],
          description: "Qualitative profitability indicator based on revenue trends.",
        },
        key_strengths: {
          type: "array",
          items: { type: "string" },
          description: "2–4 specific business strengths with naira amounts where relevant.",
        },
        key_concerns: {
          type: "array",
          items: { type: "string" },
          description: "2–4 specific concerns for the Risk Agent to evaluate.",
        },
        recommendation: {
          type: "string",
          description:
            "Your position in one sentence — e.g. 'Business fundamentals support a moderate financing offer.'",
        },
      },
      required: [
        "monthly_revenue_average",
        "revenue_stability_score",
        "business_health_score",
        "profitability_indicator",
        "key_strengths",
        "key_concerns",
        "recommendation",
      ],
    },
  },
};

export const STRUCTURE_MURABAHA_OFFER_TOOL = {
  type: "function" as const,
  function: {
    name: "structure_murabaha_offer",
    description:
      "Explain the deterministic Murabaha offer range and disbursement conditions. Murabaha = fixed fee, no interest, no compounding.",
    parameters: {
      type: "object",
      properties: {
        min_investment_naira: {
          type: "number",
          description: "Minimum customer-selectable investment amount in naira, copied from policy engine",
        },
        max_investment_naira: {
          type: "number",
          description: "Maximum approved investment amount in naira, copied from policy engine",
        },
        principal_naira: {
          type: "number",
          description: "Deprecated single amount. The backend ignores this value and uses the policy range.",
        },
        fixed_fee_naira: {
          type: "number",
          description: "Fixed Murabaha fee in naira (one-time flat fee, not interest)",
        },
        fixed_fee_pct: {
          type: "number",
          description: "Fixed fee as % of principal (typically 10-15%)",
        },
        tenor_months: {
          type: "number",
          description: "Repayment period in months",
        },
        disbursement_conditions: {
          type: "array",
          items: { type: "string" },
          description: "Conditions that must be met before funds are disbursed",
        },
        repayment_schedule_description: {
          type: "string",
          description: "Human-readable schedule e.g. '₦84,000/month over 3 months (sale price: ₦252,000)'",
        },
        structuring_rationale: {
          type: "string",
          description:
            "Murabaha rationale: what asset Zalyx buys (cost price), what it sells at (sale price = cost + profit margin), why this tenor and margin given the business health and risk findings",
        },
      },
      required: [
        "disbursement_conditions",
        "structuring_rationale",
      ],
    },
  },
};

export const ISSUE_UNDERWRITING_DECISION_TOOL = {
  type: "function" as const,
  function: {
    name: "issue_underwriting_decision",
    description:
      "Issue the final underwriting decision after reviewing all agent inputs and the full debate transcript.",
    parameters: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          enum: ["approved", "rejected", "requires-clarification"],
          description: "Final underwriting decision",
        },
        approved_amount_naira: {
          type: "number",
          description: "Maximum approved investment cap in naira. The backend sets this from policy; 0 if rejected.",
        },
        decision_rationale_underwriter: {
          type: "string",
          description:
            "Technical rationale for the underwriting team — reference specific agent findings and debate outcome",
        },
        decision_rationale_merchant: {
          type: "string",
          description:
            "Plain-English explanation for the merchant — what this means and what they need to do next",
        },
        mandatory_conditions: {
          type: "array",
          items: { type: "string" },
          description: "Non-negotiable conditions before disbursement. Empty if rejected or unconditional.",
        },
        what_debate_resolved: {
          type: "string",
          description:
            "What specific disagreement the agent debate resolved that a single-agent analysis would have missed",
        },
      },
      required: [
        "decision",
        "approved_amount_naira",
        "decision_rationale_underwriter",
        "decision_rationale_merchant",
        "what_debate_resolved",
      ],
    },
  },
};

// ── QwenClient ────────────────────────────────────────────────────────────────

export class QwenClient {
  private client: OpenAI | null = null;
  private model: string;
  private temperature: number;
  readonly mockMode = false;
  private _callCount = 0;

  /** Total Qwen API calls made since construction (or last reset). */
  getCallCount(): number { return this._callCount; }
  resetCallCount(): void { this._callCount = 0; }

  constructor() {
    const apiKey = process.env.QWEN_API_KEY;
    this.model = process.env.QWEN_MODEL || "qwen-max";
    this.temperature = Number(process.env.QWEN_TEMPERATURE ?? "0");

    if (!apiKey || apiKey === "your_qwen_cloud_api_key_here") {
      throw new Error("QWEN_API_KEY is required. Zalyx does not use fake Qwen responses in runtime.");
    }
    this.client = new OpenAI({ apiKey, baseURL: apiBase });
  }

  // ── Retry helper — exponential backoff for rate limits / transient errors ──
  private async withRetry<T>(
    fn: () => Promise<T>,
    agentName: string,
    maxAttempts = 3
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isRateLimit = err?.status === 429;
        const isTransient = err?.status === 500 || err?.status === 503;
        if (attempt === maxAttempts || (!isRateLimit && !isTransient)) throw err;
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(
          `⟳  ${agentName} attempt ${attempt} failed (${err?.status ?? "error"}) — retrying in ${(backoffMs / 1000).toFixed(1)}s`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw new Error(`${agentName}: max retries exceeded`);
  }

  // ── Standard chat completion ───────────────────────────────────────────────
  async chat(
    messages: AgentMessage[],
    agentName: string,
    systemPrompt?: string
  ): Promise<AgentResponse> {
    this._callCount++;

    return this.withRetry(async () => {
      const allMessages: AgentMessage[] = systemPrompt
        ? [{ role: "system", content: systemPrompt }, ...messages]
        : messages;

      const response = await this.client!.chat.completions.create({
        model: this.model,
        messages: allMessages as any,
        temperature: this.temperature,
        max_tokens: 1500,
      });

      return {
        message: response.choices[0].message.content ?? "No response generated",
        agentName,
        timestamp: new Date().toISOString(),
      };
    }, agentName);
  }

  // ── Function calling — Qwen invokes a tool and returns structured JSON ─────
  async chatWithTools(
    messages: AgentMessage[],
    tools: any[],
    agentName: string,
    systemPrompt?: string,
    forceToolName?: string
  ): Promise<ToolCallResult> {
    this._callCount++;

    return this.withRetry(async () => {
      const allMessages: AgentMessage[] = systemPrompt
        ? [{ role: "system", content: systemPrompt }, ...messages]
        : messages;

      const response = await this.client!.chat.completions.create({
        model: this.model,
        messages: allMessages as any,
        tools,
        tool_choice: forceToolName
          ? { type: "function", function: { name: forceToolName } }
          : "auto",
        temperature: this.temperature,
        max_tokens: 4000,
      });

      const choice = response.choices[0];
      const toolCalls = choice.message.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        const tc = toolCalls[0];
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // Qwen occasionally returns truncated JSON in tool call arguments.
          // Attempt to salvage a partial object; agents fall back to computed values.
          console.warn(`   ⚠️  [${agentName}] Tool call JSON truncated — attempting partial parse`);
          try {
            // Strip trailing incomplete key/value and close the object
            const raw = tc.function.arguments.replace(/,?\s*"[^"]*"?\s*:\s*[^,}\]]*$/, "").trimEnd();
            const closed = raw.endsWith("}") ? raw : raw + "}";
            parsedArgs = JSON.parse(closed) as Record<string, unknown>;
          } catch {
            // Fully unparseable — agents will use their computed fallback values
            console.warn(`   ⚠️  [${agentName}] Could not recover tool call JSON — using fallback values`);
          }
        }
        return {
          message: choice.message.content ?? "",
          agentName,
          timestamp: new Date().toISOString(),
          toolCall: {
            name: tc.function.name,
            arguments: parsedArgs,
          },
        };
      }

      // Qwen responded without calling a tool — treat as plain text
      return {
        message: choice.message.content ?? "No response generated",
        agentName,
        timestamp: new Date().toISOString(),
      };
    }, agentName);
  }

  // ── Convenience wrapper used by non-tool agents ───────────────────────────
  async analyzeWithContext(
    prompt: string,
    context: string,
    agentName: string
  ): Promise<AgentResponse> {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: `Context:\n${context}\n\nAnalysis request:\n${prompt}`,
      },
    ];
    return this.chat(messages, agentName);
  }
}

export function isQwenConfigured(): boolean {
  const apiKey = process.env.QWEN_API_KEY;
  return Boolean(apiKey && apiKey !== "your_qwen_cloud_api_key_here");
}

export function assertQwenConfigured(): void {
  if (!isQwenConfigured()) {
    throw new Error("QWEN_API_KEY is required before starting Zalyx Agent Society.");
  }
}

// Lazy singleton — constructed on first use by agents after startup validation.
let _qwenClient: QwenClient | null = null;
export const qwenClient = new Proxy({} as QwenClient, {
  get(_target, prop) {
    if (!_qwenClient) _qwenClient = new QwenClient();
    const value = (_qwenClient as any)[prop];
    return typeof value === "function" ? value.bind(_qwenClient) : value;
  },
});
