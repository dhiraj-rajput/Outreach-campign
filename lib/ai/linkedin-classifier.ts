/**
 * LinkedIn reply intent classifier
 *
 * Classifies an inbound LinkedIn reply using OpenRouter (or any OpenAI-compatible API).
 * Keeps messages short and professional — this is an outreach campaign, not support chat.
 *
 * Intent categories (mirrors PPT-Agent outreach_prompts.py):
 *   interested        – positive, wants to know more
 *   meeting_request   – explicitly wants to connect/call
 *   objection         – pushing back or asking defensive questions
 *   not_interested    – decline / unsubscribe
 *   out_of_office     – OOO auto-reply or human OOO
 *   unclear           – cannot determine from message
 */

import { getAIClient } from "./client";

export type LinkedInIntent =
  | "interested"
  | "meeting_request"
  | "objection"
  | "not_interested"
  | "out_of_office"
  | "unclear";

export interface ClassifyResult {
  intent: LinkedInIntent;
  confidence: number; // 0.0–1.0
  suggested_action: string;
}

const SYSTEM_PROMPT = `You are a B2B sales analyst. Classify the intent of a LinkedIn reply to an outreach message.
Return ONLY valid JSON, no markdown, no explanation.`;

const USER_PROMPT = (ourMessage: string, senderName: string, replyText: string) => `
Outreach sent: "${ourMessage}"
Reply from ${senderName}: "${replyText}"

Classify into one of: interested | meeting_request | objection | not_interested | out_of_office | unclear

JSON format:
{"intent":"<category>","confidence":<0.0-1.0>,"suggested_action":"<short next step>"}
`.trim();

export async function classifyLinkedInReply(
  replyText: string,
  senderName: string,
  ourLastMessage: string
): Promise<ClassifyResult> {
  const cfg = await getAIClient();
  if (!cfg) {
    return { intent: "unclear", confidence: 0, suggested_action: "Set Google AI Studio or OpenRouter API key in Settings → Integrations" };
  }

  try {
    const completion = await cfg.client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT(ourLastMessage, senderName, replyText) },
      ],
      max_tokens: 120,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    // Strip markdown fences if present
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      intent?: string;
      confidence?: number;
      suggested_action?: string;
    };

    const VALID_INTENTS: LinkedInIntent[] = [
      "interested", "meeting_request", "objection", "not_interested", "out_of_office", "unclear",
    ];
    const intent = VALID_INTENTS.includes(parsed.intent as LinkedInIntent)
      ? (parsed.intent as LinkedInIntent)
      : "unclear";

    return {
      intent,
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.7,
      suggested_action: parsed.suggested_action ?? "",
    };
  } catch (err) {
    console.error("[linkedin-classifier] error:", err instanceof Error ? err.message : err);
    return { intent: "unclear", confidence: 0, suggested_action: "" };
  }
}
