import type { LlmAdvisorConfig, LlmResearchMeta } from "./types.js";

export interface LlmAdvisorInput {
  family: string;
  sourceUrl: string;
  evidence: string[];
  foundryHints?: string[];
}

export interface LlmAdvisorResult {
  decision: "restricted" | "inconclusive";
  rationale: string;
  links: string[];
  aiAssisted: boolean;
  apiHost?: string;
  apiCalled?: boolean;
}

interface ResolvedLlmConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

export function isGeminiApiUrl(url: string): boolean {
  return url.includes("generativelanguage.googleapis.com");
}

export function isGroqApiUrl(url: string): boolean {
  return url.includes("groq.com");
}

export function detectLlmProvider(apiUrl: string): "gemini" | "groq" | "openai" {
  if (isGeminiApiUrl(apiUrl)) return "gemini";
  if (isGroqApiUrl(apiUrl)) return "groq";
  return "openai";
}

export function getLlmApiHost(apiUrl: string): string {
  try {
    return new URL(apiUrl).hostname;
  } catch {
    return apiUrl;
  }
}

export function isLlmAdvisorEnabledFromEnv(): boolean {
  return process.env.LICENSE_LLM_ENABLED === "true" || process.env.LICENSE_LLM_ENABLED === "1";
}

export function resolveLlmAdvisorConfig(override?: LlmAdvisorConfig): ResolvedLlmConfig | null {
  const enabled = override?.enabled ?? isLlmAdvisorEnabledFromEnv();
  if (!enabled) return null;

  const apiUrl = override?.apiUrl?.trim() || process.env.LICENSE_LLM_API_URL?.trim();
  const apiKey = override?.apiKey?.trim() || process.env.LICENSE_LLM_API_KEY?.trim();
  const model = override?.model?.trim() || process.env.LICENSE_LLM_MODEL?.trim() || "gpt-4o-mini";

  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey, model };
}

export function isLlmAdvisorEnabled(override?: LlmAdvisorConfig): boolean {
  return resolveLlmAdvisorConfig(override) !== null;
}

export function buildLlmResearchMeta(options: {
  enableLlmAdvisor?: boolean;
  llmAdvisor?: LlmAdvisorConfig;
}): LlmResearchMeta {
  const requested =
    options.llmAdvisor?.enabled === true ||
    options.enableLlmAdvisor === true ||
    isLlmAdvisorEnabledFromEnv();

  if (!requested) {
    return { requested: false, active: false, reason: "not_enabled" };
  }

  const config = resolveLlmAdvisorConfig(options.llmAdvisor);
  if (!config) {
    return { requested: true, active: false, reason: "missing_config" };
  }

  return {
    requested: true,
    active: true,
    provider: detectLlmProvider(config.apiUrl),
    apiHost: getLlmApiHost(config.apiUrl),
    model: config.model,
  };
}

/** @deprecated Use isLlmAdvisorEnabledFromEnv */
export function isLlmAdvisorEnabledLegacy(): boolean {
  return isLlmAdvisorEnabledFromEnv();
}

function buildPrompt(input: LlmAdvisorInput): string {
  return [
    "You are a font licensing research assistant. You must NOT provide legal advice.",
    "Review the font evidence and decide whether there is credible evidence that the font is paid, proprietary, or restricted for self-hosting.",
    "You may ONLY answer with JSON in this exact shape:",
    '{"decision":"restricted"|"inconclusive","rationale":"...","links":["..."]}',
    "Rules:",
    "- Never answer that a font is free or safe to use.",
    "- Use decision=restricted only when evidence strongly suggests a paid/proprietary/commercial license is required.",
    "- Otherwise use decision=inconclusive.",
    "",
    `Font family: ${input.family}`,
    `Source URL: ${input.sourceUrl}`,
    input.foundryHints?.length ? `Foundry hints: ${input.foundryHints.join("; ")}` : "",
    `Existing evidence: ${input.evidence.join(" | ") || "none"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseAdvisorResponse(text: string, apiHost: string): LlmAdvisorResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      decision: "inconclusive",
      rationale: "LLM response was not valid JSON.",
      links: [],
      aiAssisted: true,
      apiHost,
      apiCalled: true,
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    decision?: string;
    rationale?: string;
    links?: string[];
  };

  const decision = parsed.decision === "restricted" ? "restricted" : "inconclusive";
  return {
    decision,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "No rationale provided.",
    links: Array.isArray(parsed.links)
      ? parsed.links.filter((link): link is string => typeof link === "string")
      : [],
    aiAssisted: true,
    apiHost,
    apiCalled: true,
  };
}

function resolveGeminiRequestUrl(config: ResolvedLlmConfig): string {
  let apiUrl = config.apiUrl.trim();
  if (!apiUrl.includes(":generateContent")) {
    const model = config.model || "gemini-2.0-flash";
    apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }

  const url = new URL(apiUrl);
  if (!url.searchParams.has("key")) {
    url.searchParams.set("key", config.apiKey);
  }
  return url.toString();
}

async function callGeminiAdvisor(
  config: ResolvedLlmConfig,
  input: LlmAdvisorInput
): Promise<LlmAdvisorResult> {
  const apiHost = getLlmApiHost(config.apiUrl);
  const prompt = buildPrompt(input);
  const response = await fetch(resolveGeminiRequestUrl(config), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "Respond with JSON only. Never classify a font as free. This is not legal advice.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(Number(process.env.LICENSE_LLM_TIMEOUT_MS ?? 20_000)),
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!response.ok) {
    const message = payload.error?.message ?? `HTTP ${response.status}`;
    return {
      decision: "inconclusive",
      rationale: `LLM request failed (${apiHost}): ${message}`,
      links: [],
      aiAssisted: true,
      apiHost,
      apiCalled: true,
    };
  }

  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseAdvisorResponse(content, apiHost);
}

async function callOpenAiAdvisor(
  config: ResolvedLlmConfig,
  input: LlmAdvisorInput
): Promise<LlmAdvisorResult> {
  const apiHost = getLlmApiHost(config.apiUrl);
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Respond with JSON only. Never classify a font as free. This is not legal advice.",
        },
        { role: "user", content: buildPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(Number(process.env.LICENSE_LLM_TIMEOUT_MS ?? 20_000)),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errorPayload = (await response.json()) as { error?: { message?: string } };
      if (errorPayload.error?.message) {
        detail = errorPayload.error.message;
      }
    } catch {
      // ignore JSON parse errors
    }

    return {
      decision: "inconclusive",
      rationale: `LLM request failed (${apiHost}): ${detail}`,
      links: [],
      aiAssisted: true,
      apiHost,
      apiCalled: true,
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  return parseAdvisorResponse(content, apiHost);
}

export async function adviseFontLicense(
  input: LlmAdvisorInput,
  override?: LlmAdvisorConfig
): Promise<LlmAdvisorResult> {
  const config = resolveLlmAdvisorConfig(override);
  if (!config) {
    return {
      decision: "inconclusive",
      rationale: "LLM advisor is disabled or not configured.",
      links: [],
      aiAssisted: false,
    };
  }

  try {
    if (isGeminiApiUrl(config.apiUrl)) {
      return await callGeminiAdvisor(config, input);
    }
    return await callOpenAiAdvisor(config, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const apiHost = getLlmApiHost(config.apiUrl);
    return {
      decision: "inconclusive",
      rationale: `LLM advisor error (${apiHost}): ${message}`,
      links: [],
      aiAssisted: true,
      apiHost,
      apiCalled: true,
    };
  }
}
