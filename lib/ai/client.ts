/**
 * Unified AI Client supporting:
 * 1. Google AI Studio (Gemini) API Key
 * 2. OpenRouter API Key
 *
 * Provides short, professional messaging and intent classification.
 */

import OpenAI from "openai";
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export interface AIProviderConfig {
  provider: "gemini" | "openrouter";
  client: OpenAI;
  model: string;
}

export function getAIClient(preferredModel?: string): AIProviderConfig | null {
  const db = getDb();

  // 1. Check Google AI Studio (Gemini) first
  const geminiRow = db
    .prepare("SELECT api_key FROM integrations WHERE key IN ('gemini', 'google') AND api_key IS NOT NULL")
    .get() as { api_key: string } | undefined;

  if (geminiRow?.api_key) {
    const key = decryptSecret(geminiRow.api_key) ?? geminiRow.api_key;
    if (key.trim()) {
      return {
        provider: "gemini",
        client: new OpenAI({
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          apiKey: key,
        }),
        model: preferredModel || "gemini-2.0-flash",
      };
    }
  }

  // 2. Check OpenRouter
  const openrouterRow = db
    .prepare("SELECT api_key FROM integrations WHERE key = 'openrouter' AND api_key IS NOT NULL")
    .get() as { api_key: string } | undefined;

  if (openrouterRow?.api_key) {
    const key = decryptSecret(openrouterRow.api_key) ?? openrouterRow.api_key;
    if (key.trim()) {
      return {
        provider: "openrouter",
        client: new OpenAI({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: key,
        }),
        model: preferredModel || "google/gemini-flash-1.5",
      };
    }
  }

  return null;
}

/**
 * Generate a short, professional LinkedIn message / outreach text using AI
 */
export async function generateOutreachText(prompt: string, contextText: string): Promise<string> {
  const config = getAIClient();
  if (!config) {
    throw new Error("No AI integration configured. Please add a Google AI Studio or OpenRouter key in Settings → Integrations.");
  }

  const completion = await config.client.chat.completions.create({
    model: config.model,
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

  return completion.choices[0]?.message?.content?.trim() ?? "";
}
