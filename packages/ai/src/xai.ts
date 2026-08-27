import type { AiCaller } from "./runtime.ts";

export function createXaiCaller(apiKey: string): AiCaller {
  return async (request) => {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      throw new Error(`xAI ${request.purpose} failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error(`xAI ${request.purpose} returned empty content`);
    }
    return {
      text,
      inTokens: body.usage?.prompt_tokens ?? 0,
      outTokens: body.usage?.completion_tokens ?? 0,
    };
  };
}
