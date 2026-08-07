/**
 * Unified AI Client with multi-provider fallback chain:
 * 1. Google AI Studio (Gemini) API Key
 * 2. OpenRouter API Key
 *
 * Automatically fails over to the next provider if a provider returns 429 (Rate Limit), 404, or 401.
 */

import OpenAI from "openai";
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export interface AIProviderConfig {
  provider: "gemini" | "openrouter";
  client: OpenAI;
  model: string;
}

export function getAllAIProviders(preferredModel?: string): AIProviderConfig[] {
  const db = getDb();
  const providers: AIProviderConfig[] = [];

  // 1. Google AI Studio (Gemini)
  try {
    const geminiRow = db
      .prepare("SELECT api_key, model FROM integrations WHERE key IN ('gemini', 'google') AND api_key IS NOT NULL")
      .get() as { api_key: string; model: string | null } | undefined;

    const geminiKey = geminiRow?.api_key ? (decryptSecret(geminiRow.api_key) ?? geminiRow.api_key) : undefined;

    if (geminiKey && geminiKey.trim()) {
      let activeModel = preferredModel || geminiRow?.model || "gemini-2.0-flash";
      if (activeModel.includes("/") || activeModel.includes("openrouter") || activeModel.includes("llama") || activeModel.includes("deepseek") || activeModel.includes("qwen")) {
        activeModel = geminiRow?.model || "gemini-2.0-flash";
      }
      const deprecatedOrInvalid: Record<string, string> = {
        "gemini-pro": "gemini-1.5-flash",
        "gemini-1.0-pro": "gemini-1.5-flash",
        "gemini-2.5-flash": "gemini-2.0-flash",
        "gemini-2.5-pro": "gemini-1.5-pro",
        "gemini-3-flash-preview": "gemini-2.0-flash",
        "gemini-2.5-flash-lite": "gemini-2.0-flash-lite",
      };
      if (deprecatedOrInvalid[activeModel]) {
        activeModel = deprecatedOrInvalid[activeModel];
      }

      providers.push({
        provider: "gemini",
        client: new OpenAI({
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          apiKey: geminiKey.trim(),
        }),
        model: activeModel,
      });
    }
  } catch (err) {
    console.warn("[ai-client] Failed reading Gemini integration:", err);
  }

  // 2. OpenRouter
  try {
    const openrouterRow = db
      .prepare("SELECT api_key, model FROM integrations WHERE key = 'openrouter' AND api_key IS NOT NULL")
      .get() as { api_key: string; model: string | null } | undefined;

    const openrouterKey = openrouterRow?.api_key ? (decryptSecret(openrouterRow.api_key) ?? openrouterRow.api_key) : undefined;

    if (openrouterKey && openrouterKey.trim()) {
      let activeModel = preferredModel || openrouterRow?.model || "google/gemini-2.0-flash-exp:free";
      if (activeModel.startsWith("gemini-") && !activeModel.includes("/")) {
        activeModel = "google/gemini-2.0-flash-exp:free";
      }
      providers.push({
        provider: "openrouter",
        client: new OpenAI({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: openrouterKey.trim(),
          defaultHeaders: {
            "HTTP-Referer": "https://linki.app",
            "X-Title": "Linki Outreach",
          },
        }),
        model: activeModel,
      });
    }
  } catch (err) {
    console.warn("[ai-client] Failed reading OpenRouter integration:", err);
  }

  return providers;
}

export function getAIClient(preferredModel?: string): AIProviderConfig | null {
  const providers = getAllAIProviders(preferredModel);
  return providers[0] ?? null;
}

export interface ChatCompletionParams {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  preferredModel?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Execute chat completion with automatic failover across all configured AI providers.
 * If Provider 1 (e.g. Gemini) returns 429 rate limit or error, automatically tries Provider 2 (e.g. OpenRouter).
 */
export async function runAICompletion(params: ChatCompletionParams): Promise<{
  content: string;
  provider: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}> {
  const providers = getAllAIProviders(params.preferredModel);
  if (providers.length === 0) {
    throw new Error("No AI integration configured. Please add a Google AI Studio or OpenRouter API key in Settings → Integrations.");
  }

  let lastError: Error | null = null;

  for (const config of providers) {
    try {
      console.log(`[ai-client] Attempting generation with provider=${config.provider}, model=${config.model}`);
      const completion = await config.client.chat.completions.create({
        model: config.model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 1000,
      });

      const content = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!content) throw new Error("AI returned empty content");

      return {
        content,
        provider: config.provider,
        model: config.model,
        prompt_tokens: completion.usage?.prompt_tokens,
        completion_tokens: completion.usage?.completion_tokens,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] Provider ${config.provider} (${config.model}) failed:`, lastError.message);
      // Continue to next provider in fallback chain
    }
  }

  throw lastError ?? new Error("All configured AI providers failed.");
}

/**
 * Generate a short, professional LinkedIn message / outreach text using AI with automatic failover
 */
export async function generateOutreachText(prompt: string, contextText: string): Promise<string> {
  const result = await runAICompletion({
    messages: [
      {
        role: "system",
        content: "You are a professional B2B sales outreach copywriter. Keep messages concise, friendly, personalized, and under 100 words.",
      },
      {
        role: "user",
        content: `Context:\n${contextText}\n\nInstruction:\n${prompt}`,
      },
    ],
    max_tokens: 250,
    temperature: 0.7,
  });

  return result.content;
}
