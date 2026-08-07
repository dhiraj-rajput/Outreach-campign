import { runAICompletion } from "@/lib/ai/client";

export type BeautifyStyle = "professional" | "friendly" | "bold";

const STYLE_DESCRIPTIONS: Record<BeautifyStyle, string> = {
  professional: "Sleek dark slate gradient header (#0f172a to #334155), crisp corporate typography, white card background (#ffffff), soft shadow border, dark slate text (#1e293b)",
  friendly: "Warm emerald and teal gradient header (#064e3b to #0d9488), approachable layout, rounded cards (#f0fdf4), dark teal text (#064e3b)",
  bold: "Modern dark theme header (#09090b with vibrant #4338ca indigo accents), high contrast, bold headlines, crisp typography",
};

export interface BeautifyResult {
  html: string;
  usedFallback: boolean;
  error?: string;
}

function fallbackTemplate(subject: string, body: string, style: BeautifyStyle = "professional"): string {
  const escapedBody = body.replace(/\n/g, "<br>");
  const headerBg =
    style === "friendly"
      ? "linear-gradient(135deg, #064e3b 0%, #0d9488 100%)"
      : style === "bold"
      ? "linear-gradient(135deg, #09090b 0%, #4338ca 100%)"
      : "linear-gradient(135deg, #0f172a 0%, #334155 100%)";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
        <tr>
          <td style="background:${headerBg};padding:32px 36px;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">${subject || "Important Update"}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;color:#334155;font-size:15px;line-height:1.7;">
            ${escapedBody}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px;background:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">
            <a href="{{unsubscribe_url}}" style="color:#64748b;text-decoration:none;font-weight:500;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function stripFences(html: string): string {
  let out = html.trim();
  if (out.startsWith("```")) out = out.includes("\n") ? out.split("\n").slice(1).join("\n") : out.slice(3);
  if (out.endsWith("```")) out = out.includes("\n") ? out.split("\n").slice(0, -1).join("\n") : out.slice(0, -3);
  return out.trim();
}

/**
 * Convert a plain-text email draft into a responsive, inline-CSS HTML email.
 */
export async function beautifyEmail(
  subject: string,
  body: string,
  style: BeautifyStyle = "professional"
): Promise<BeautifyResult> {
  const styleDesc = STYLE_DESCRIPTIONS[style] ?? STYLE_DESCRIPTIONS.professional;
  const prompt = `You are an elite B2B email designer. Convert this plain-text email draft into a responsive HTML email with inline CSS.

Return ONLY valid raw HTML — no markdown, no code fences, no explanation text before or after.

Design guidelines:
- Inline CSS styling for maximum email client compatibility (Gmail, Outlook, Apple Mail)
- Centered container layout max-width 600px with smooth rounded corners (border-radius: 16px)
- Beautiful gradient header banner reflecting the style theme (Dark Slate #0f172a, Emerald Teal #064e3b, or Midnight Indigo #09090b — do NOT use static bright blue)
- Body font stack: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- Paragraph line-height: 1.7, font-size: 15px
- Style Preset: ${styleDesc}
- Include an unsubscribe footer link at the bottom pointing to {{unsubscribe_url}}
- Subject / Title: "${subject}"

Plain text draft:
${body}`;

  try {
    const result = await runAICompletion({
      messages: [
        {
          role: "system",
          content: "You are an expert HTML email designer. Return ONLY raw HTML without markdown formatting or code blocks.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    const cleanHtml = stripFences(result.content);
    return { html: cleanHtml, usedFallback: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[beautify-email] AI generation failed, using fallback template:", reason);
    return { html: fallbackTemplate(subject, body, style), usedFallback: true, error: reason };
  }
}
