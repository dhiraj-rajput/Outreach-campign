/**
 * POST /api/newsletters/ai-generate
 *
 * Uses the unified AI Client (Gemini or OpenRouter) to write or polish
 * newsletter issues/editions based on a title/topic prompt.
 *
 * Body: { title: string; prompt?: string; style?: string; bannerUrl?: string }
 * Returns: { subject: string; content_html: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { runAICompletion } from "@/lib/ai/client";

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

  const SYSTEM_PROMPT = `You are an expert B2B newsletter copywriter. Write a short, engaging, professional newsletter issue body.

CRITICAL INSTRUCTIONS:
- You MUST respond with ONLY a raw JSON object.
- NO inner monologue, NO reasoning, NO explanation, NO preamble, NO markdown fences.
- JSON structure: {"subject": "<Catchy subject line under 60 chars>", "content_html": "<Clean HTML body paragraphs, bullet points, and callout box>"}`;

  const USER_PROMPT = `Newsletter Topic / Title: "${title}"
Guidelines / Context: "${prompt || "Provide a warm greeting, concise introduction, 3 key takeaways with bold highlights, and a brief closing."}"`;

  try {
    const result = await runAICompletion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT },
      ],
      max_tokens: 1000,
      temperature: 0.5,
    });

    const raw = result.content;
    let parsed: { subject?: string; content_html?: string } = {};

    // Robust JSON extraction — strip any leading/trailing reasoning or thinking text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = { subject: title, content_html: `<p>${raw}</p>` };
      }
    } else {
      parsed = { subject: title, content_html: `<p>${raw}</p>` };
    }

    let finalHtml = parsed.content_html || `<p>${title}</p>`;

    // Clean up any leaked reasoning artifacts if present in content_html
    if (finalHtml.includes("We need to output JSON") || finalHtml.includes("Let's draft")) {
      finalHtml = finalHtml.replace(/We need to output JSON[\s\S]*?content_html":\s*"/i, "").replace(/"\s*\}\s*$/i, "");
    }

    // Embed header banner image if provided
    if (bannerUrl && bannerUrl.trim()) {
      const bannerHtml = `
<div style="text-align: center; margin-bottom: 24px;">
  <img src="${bannerUrl.trim()}" alt="Newsletter Banner" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid #e2e8f0; display: block; margin: 0 auto;" />
</div>`.trim();
      finalHtml = `${bannerHtml}\n${finalHtml}`;
    }

    // Wrap in standard responsive card container if not wrapped
    if (!finalHtml.includes("<!DOCTYPE html>")) {
      finalHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 15px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
        <tr>
          <td style="background:linear-gradient(135deg, #0f172a 0%, #2563eb 100%);padding:32px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;line-height:1.3;">${parsed.subject || title}</h1>
                </td>
                <td align="right" valign="top" style="white-space:nowrap;padding-left:16px;">
                  <a href="{{unsubscribe_url}}" style="color:#ffffff;font-size:12px;font-weight:600;text-decoration:none;background:rgba(255,255,255,0.2);padding:6px 12px;border-radius:20px;display:inline-block;">Unsubscribe</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;color:#334155;font-size:15px;line-height:1.7;">
            ${finalHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 36px;background:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">
            Sent with Linki · <a href="{{unsubscribe_url}}" style="color:#2563eb;text-decoration:none;font-weight:500;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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
