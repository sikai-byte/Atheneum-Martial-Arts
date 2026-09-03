const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514";

export type LlmCall = {
  prompt: string;
  system?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type LlmResponse = { text: string; model: string };

export function llmConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function llmModel(): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return process.env.OPENAI_API_KEY ? OPENAI_DEFAULT_MODEL : ANTHROPIC_DEFAULT_MODEL;
}

async function callOpenAi(call: LlmCall): Promise<LlmResponse | null> {
  const model = process.env.LLM_MODEL || OPENAI_DEFAULT_MODEL;
  const messages = [
    ...(call.system ? [{ role: "system", content: call.system }] : []),
    { role: "user", content: call.prompt },
  ];
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(call.json ? { response_format: { type: "json_object" } } : {}),
      max_tokens: call.maxTokens ?? 800,
      temperature: call.temperature ?? 0.3,
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content;
  return text ? { text, model } : null;
}

async function callAnthropic(call: LlmCall): Promise<LlmResponse | null> {
  const model = process.env.LLM_MODEL || ANTHROPIC_DEFAULT_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: call.maxTokens ?? 800,
      temperature: call.temperature ?? 0.3,
      ...(call.system ? { system: call.system } : {}),
      messages: [{ role: "user", content: call.prompt }],
    }),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { content?: { text?: string }[] };
  const text = payload.content?.[0]?.text;
  return text ? { text, model } : null;
}

/**
 * Single entry point for model calls. Returns null on any failure so every caller is forced to
 * carry a deterministic fallback — the follow-up cadence must never stall on a provider outage.
 */
export async function callLlm(call: LlmCall): Promise<LlmResponse | null> {
  if (!llmConfigured()) return null;
  try {
    return process.env.OPENAI_API_KEY ? await callOpenAi(call) : await callAnthropic(call);
  } catch (error) {
    console.warn("[llm] call failed", error);
    return null;
  }
}

/** Pulls the first JSON object out of a model response, tolerating prose or code fences. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
