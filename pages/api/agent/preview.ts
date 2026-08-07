import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { getAIClient } from "@/lib/ai/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { step_type, ai_model, ai_prompt, ai_max_words, ai_language, target_id } = req.body;

  if (!target_id) {
    return res.status(400).json({ error: "target_id is required" });
  }

  const ai = getAIClient(ai_model);
  if (!ai) {
    return res.status(400).json({ error: "No AI provider configured. Add a Gemini or OpenRouter key in Settings → Integrations." });
  }

  const db = getDb();
  const target = db
    .prepare("SELECT * FROM targets WHERE id = ?")
    .get(target_id) as Record<string, unknown> | undefined;

  if (!target) {
    return res.status(404).json({ error: "Target not found" });
  }

  const leadName = (target.full_name as string) || (target.first_name as string) || "Lead";
  const title = (target.title as string) || "Professional";
  const company = (target.company as string) || "Company";
  const isEmail = step_type === "email" || step_type === "newsletter";

  const contextText = `Lead Name: ${leadName}\nJob Title: ${title}\nCompany: ${company}\nLanguage: ${ai_language || "English"}`;
  const instruction = ai_prompt || "Introduce our solutions and offer a quick intro chat.";

  try {
    const messages = [
      {
        role: "system" as const,
        content: isEmail
          ? `You are an expert B2B email copywriter. Write a personalized email. Output JSON with fields: "subject" and "body". Max words: ${ai_max_words || 120}.`
          : `You are an expert B2B LinkedIn outreach specialist. Write a concise personalized message under ${ai_max_words || 80} words. Output JSON with field: "body".`,
      },
      {
        role: "user" as const,
        content: `Lead Information:\n${contextText}\n\nInstruction:\n${instruction}\n\nRespond ONLY with valid JSON.`,
      },
    ];

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    let json: { subject?: string; body?: string } = {};

    try {
      const cleanJson = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      json = JSON.parse(cleanJson);
    } catch {
      json = { body: raw };
    }

    return res.status(200).json({
      subject: json.subject || (isEmail ? `Quick question for ${leadName}` : undefined),
      body: json.body || raw,
      input_tokens: completion.usage?.prompt_tokens ?? 120,
      output_tokens: completion.usage?.completion_tokens ?? 80,
      cost_usd: 0.0001,
    });
  } catch (err) {
    console.error("[preview] AI generation error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "AI generation failed" });
  }
}
