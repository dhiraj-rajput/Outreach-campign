import { getAIClient } from "@/lib/ai/client";

// Direct port of PPT-Agent's backend/app/routes/campaigns.py::beautify_email(). PPT-Agent's
// version calls its own internal AI client (Ollama → Gemini → OpenRouter fallback chain);
// linki's equivalent multi-provider AI plumbing (premium.ai) lives in the ee/-only build and
// is not present in this zip (see 01-comparison-report.md §1/§5), so this module goes through
// the same shared, free-tier AI client (lib/ai/client.ts) that newsletter AI-generate and the
// LinkedIn reply classifier already use — it reads whichever of Gemini/OpenRouter the user has
// configured in Settings → Integrations. (An earlier version of this file queried the
// `integrations` table directly and read its model from `agent_config.default_model`, a column
// that's only ever written by the ee/-only premium AI writer — in this public build that column
// is always NULL, so beautify silently fell back to the plain template on every call even with
// a valid key configured.) If no provider is configured, or the call fails for any reason, this
// degrades to the same styled fallback template PPT-Agent falls back to — beautify never blocks
// the user from sending.

export type BeautifyStyle = "professional" | "friendly" | "bold";

const STYLE_DESCRIPTIONS: Record<BeautifyStyle, string> = {
  professional: "Sleek slate-blue gradient header, crisp corporate typography, white card background, soft shadow border, dark slate text",
  friendly: "Warm emerald and teal gradient header, approachable layout, rounded cards, dark teal text",
  bold: "Modern dark theme header, high contrast, bold headlines, crisp typography",
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
      ? "linear-gradient(135deg, #059669 0%, #0d9488 100%)"
      : style === "bold"
      ? "linear-gradient(135deg, #09090b 0%, #4f46e5 100%)"
      : "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)";

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
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">${subject || "Important Update"}</h1>
                </td>
                <td align="right" valign="top" style="white-space:nowrap;padding-left:16px;">
                  <a href="{{unsubscribe_url}}" style="color:#ffffff;font-size:12px;font-weight:600;text-decoration:none;background:rgba(255,255,255,0.2);padding:6px 12px;border-radius:20px;display:inline-block;">Unsubscribe</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;color:#334155;font-size:15px;line-height:1.7;">
            ${escapedBody}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;background:#f1f5f9;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;">
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
  const ai = getAIClient();
  if (!ai) {
    return {
      html: fallbackTemplate(subject, body, style),
      usedFallback: true,
      error: "No AI integration configured. Add a Google AI Studio or OpenRouter key in Settings → Integrations.",
    };
  }

  const styleDesc = STYLE_DESCRIPTIONS[style] ?? STYLE_DESCRIPTIONS.professional;
  const prompt = `You are an elite B2B email designer. Convert this plain-text email draft into a responsive HTML email with inline CSS.

Return ONLY valid raw HTML — no markdown, no code fences, no explanation text before or after.

Design guidelines:
- Inline CSS styling for maximum email client compatibility (Gmail, Outlook, Apple Mail)
- Centered container layout max-width 600px with smooth rounded corners (border-radius: 16px)
- Beautiful gradient header banner reflecting the style theme
- Body font stack: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- Paragraph line-height: 1.7, font-size: 15px
- Style Preset: ${styleDesc}
- Include an unsubscribe footer link at the bottom pointing to {{unsubscribe_url}}
- Subject / Title: "${subject}"

Plain text draft:
${body}`;

  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: "You are an expert HTML email designer. Return ONLY raw HTML without markdown formatting or code blocks.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error("AI returned an empty response");

    const cleanHtml = stripFences(raw);
    return { html: cleanHtml, usedFallback: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[beautify-email] AI generation failed, using fallback template:", reason);
    return { html: fallbackTemplate(subject, body, style), usedFallback: true, error: reason };
  }
}
