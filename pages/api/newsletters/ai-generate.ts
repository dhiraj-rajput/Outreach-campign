/**
 * POST /api/newsletters/ai-generate
 *
 * Uses the unified AI Client (Gemini or OpenRouter) to write or polish
 * newsletter issues/editions based on a title/topic prompt.
 *
 * Body: { title: string; prompt?: string; style?: string }
 * Returns: { subject: string; content_html: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getAIClient } from "@/lib/ai/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const { title, prompt, bannerUrl, style = "professional" } = req.body as {
    title?: string;
    prompt?: string;
    bannerUrl?: string;
    style?: string;
  };

  if (!title) return res.status(400).json({ error: "title is required" });

  const ai = getAIClient();
  if (!ai) {
    return res.status(400).json({
      error: "No AI integration configured. Please add a Google AI Studio or OpenRouter key in Settings → Integrations.",
    });
  }

  const SYSTEM_PROMPT = `You are an expert newsletter editor and HTML email copywriter.
Generate an engaging newsletter issue subject and responsive HTML body.
Style theme: ${style}. Return ONLY valid JSON with keys "subject" and "content_html". No markdown fences.`;

  const USER_PROMPT = `Newsletter Title / Topic: "${title}"
Additional Instructions: "${prompt || "Provide 3 concise bullet points with actionable takeaways and a brief introduction."}"

JSON format:
{"subject":"<catchy email subject>","content_html":"<inline-styled clean HTML content>"}`;

  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT },
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(jsonStr) as { subject?: string; content_html?: string };

    let finalHtml = parsed.content_html || `<p>${title}</p>`;

    // Embed and beautify header banner image if provided
    if (bannerUrl && bannerUrl.trim()) {
      const bannerHtml = `
<div style="text-align: center; margin-bottom: 24px;">
  <img src="${bannerUrl.trim()}" alt="Newsletter Banner" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; display: block; margin: 0 auto;" />
</div>`.trim();
      finalHtml = `${bannerHtml}\n${finalHtml}`;
    }

    return res.json({
      subject: parsed.subject || title,
      content_html: finalHtml,
    });
  } catch (err) {
    console.error("[ai-generate newsletter] error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "AI generation failed. Check your API key settings." });
  }
}
