import OpenAI from "openai";

export interface AgentMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentResponse {
  message: string;
  agentName: string;
  timestamp: string;
}

export class QwenClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.QWEN_API_KEY;
    const apiBase = process.env.QWEN_API_BASE_URL;
    this.model = process.env.QWEN_MODEL || "qwen-max";

    if (!apiKey) {
      throw new Error("QWEN_API_KEY environment variable is required");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: apiBase,
    });
  }

  async chat(
    messages: AgentMessage[],
    agentName: string,
    systemPrompt?: string
  ): Promise<AgentResponse> {
    try {
      const allMessages: AgentMessage[] = systemPrompt
        ? [{ role: "system", content: systemPrompt }, ...messages]
        : messages;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages as any,
        temperature: 0.7,
        max_tokens: 1500,
      });

      const content =
        response.choices[0].message.content || "No response generated";

      return {
        message: content,
        agentName,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error calling Qwen API for ${agentName}:`, error);
      throw error;
    }
  }

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

// Export singleton instance
export const qwenClient = new QwenClient();
