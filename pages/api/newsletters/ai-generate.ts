/**
 * POST /api/newsletters/ai-generate
 *
 * Body: { title: string; prompt?: string; style?: string; bannerUrl?: string }
 * Returns: { subject: string; content_html: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { runAICompletion } from "@/lib/ai/client";

type NewsletterStyle = "professional" | "friendly" | "bold";

const STYLE_HEADER: Record<NewsletterStyle, string> = {
  professional: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)",
  friendly: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)",
  bold: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)",
};

const STYLE_COPY: Record<NewsletterStyle, string> = {
  professional:
    "Tone: authoritative, clear, executive-friendly B2B. Short paragraphs. No hype, no emojis, no slang.",
  friendly:
    "Tone: warm and human but still professional. Conversational without being casual or salesy.",
  bold:
    "Tone: confident and direct. Strong headlines, tight copy, one clear takeaway per section.",
};

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

  const mood = (["professional", "friendly", "bold"].includes(style)
    ? style
    : "professional") as NewsletterStyle;

  const SYSTEM_PROMPT = `You are a senior B2B newsletter editor and copywriter.

Return ONLY a raw JSON object. No markdown fences, no reasoning, no preamble.

JSON shape:
{
  "subject": "Subject line under 60 characters, specific and professional",
  "content_html": "HTML fragment for the body only (not a full document). Use <p>, <h2>, <ul><li>, <strong>. Optional one callout as a simple bordered div. No scripts, no external CSS, no images unless described in text."
}

Editorial standards:
- Professional newsletter quality suitable for founders, operators, and sales leaders
- 3–5 short sections max; scannable
- One clear idea per section
- Avoid clickbait, hype adjectives, and filler
- ${STYLE_COPY[mood]}`;

  const USER_PROMPT = `Newsletter working title: ${title}

Editor brief / angle:
${prompt || "Open with a short context paragraph, then 3 concrete takeaways with bold labels, then a brief closing line and optional soft CTA."}

Write the subject and body HTML fragment now.`;

  try {
    const result = await runAICompletion({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_PROMPT },
      ],
      max_tokens: 2048,
      temperature: 0.45,
    });

    const raw = result.content;
    let parsed: { subject?: string; content_html?: string } = {};

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

    let bodyHtml = parsed.content_html || `<p>${title}</p>`;
    if (bodyHtml.includes("We need to output JSON") || bodyHtml.includes("Let's draft")) {
      bodyHtml = bodyHtml
        .replace(/We need to output JSON[\s\S]*?content_html":\s*"/i, "")
        .replace(/"\s*\}\s*$/i, "");
    }

    if (bannerUrl && bannerUrl.trim()) {
      const bannerHtml = `
<div style="text-align:center;margin:0 0 24px 0;">
  <img src="${bannerUrl.trim()}" alt="" width="600" style="max-width:100%;height:auto;display:block;margin:0 auto;border:0;border-radius:8px;" />
</div>`.trim();
      bodyHtml = `${bannerHtml}\n${bodyHtml}`;
    }

    const headerGradient = STYLE_HEADER[mood];
    const subjectLine = (parsed.subject || title).replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let finalHtml = bodyHtml;
    if (!finalHtml.includes("<!DOCTYPE html>")) {
      finalHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 14px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:${headerGradient};padding:28px 32px;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;line-height:1.3;font-family:Arial,Helvetica,sans-serif;">${subjectLine}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;color:#334155;font-size:15px;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;font-family:Arial,Helvetica,sans-serif;">
            <a href="{{unsubscribe_url}}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
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
