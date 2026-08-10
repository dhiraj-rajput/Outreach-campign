import { runAICompletion } from "@/lib/ai/client";

export type BeautifyStyle = "professional" | "friendly" | "bold";

/**
 * Mood guides the AI — it picks concrete hex values per run so outreach emails
 * are not locked to one color. Structure stays email-client safe (tables + inline CSS).
 */
const STYLE_GUIDANCE: Record<BeautifyStyle, string> = {
  professional: `Mood: polished B2B outreach / cold email.
Header & accents: cool corporate family (slate, charcoal, navy, steel) — YOU choose exact hex.
Avoid playful pastels. White or off-white card. Dark slate body text. One clear CTA if present.`,
  friendly: `Mood: warm, approachable outreach (still professional, not casual spam).
Header & accents: soft teal / soft green / warm blue-green family — YOU choose exact hex.
Light card background. Friendly but readable body text. Soft rounded feel.`,
  bold: `Mood: modern, high-contrast outreach.
Header & accents: deep dark + strong accent (indigo, violet, or deep teal) — YOU choose exact hex.
High contrast headlines. Crisp typography. Confident, not flashy.`,
};

export interface BeautifyResult {
  html: string;
  usedFallback: boolean;
  error?: string;
}

function fallbackTemplate(subject: string, body: string, style: BeautifyStyle = "professional"): string {
  let cleanBodyText = body
    .replace(/User Safety:\s*safe/gi, "")
    .replace(/Safety evaluation:[\s\S]*/gi, "")
    .trim();
  if (!cleanBodyText || cleanBodyText.length < 15) {
    cleanBodyText =
      "I hope you're having a great week. I'm reaching out because I think there may be a fit worth a short conversation.";
  }
  const escapedBody = cleanBodyText.replace(/\n/g, "<br>");
  const headerBg =
    style === "friendly"
      ? "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)"
      : style === "bold"
        ? "linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)"
        : "linear-gradient(135deg, #0f172a 0%, #334155 100%)";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr>
          <td style="background:${headerBg};padding:28px 32px;">
            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;line-height:1.35;font-family:Arial,Helvetica,sans-serif;">${subject || "Quick note"}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;color:#334155;font-size:15px;line-height:1.65;font-family:Arial,Helvetica,sans-serif;">
            ${escapedBody}
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;color:#94a3b8;font-size:12px;font-family:Arial,Helvetica,sans-serif;">
            <a href="{{unsubscribe_url}}" style="color:#64748b;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function stripFences(raw: string): string {
  let out = raw.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return out.trim();
}

/**
 * Convert a plain-text outreach draft into responsive HTML with inline CSS.
 * Colors vary by style mood; the model chooses hex values (not forced to blue).
 */
export async function beautifyEmail(
  subject: string,
  body: string,
  style: BeautifyStyle = "professional"
): Promise<BeautifyResult> {
  const guidance = STYLE_GUIDANCE[style] ?? STYLE_GUIDANCE.professional;
  const safeSubject = subject.replace(/"/g, "'");

  const prompt = `Act as an expert HTML email developer for B2B outreach / cold email.

Convert the plain-text draft into ONE complete HTML email.

OUTPUT RULES:
- Return ONLY raw HTML (no markdown fences, no commentary, no safety tags).
- Table-based layout, role="presentation" on layout tables.
- ALL critical CSS must be inline (Gmail strips <style> for many users).
- Max width 600px, centered.
- Web-safe font stack ending in Arial, Helvetica, sans-serif.
- Include {{unsubscribe_url}} in a quiet footer link.

STRUCTURE (keep this layout — vary colors by mood):
1. Outer background table
2. Inner white card (border-radius ~12px)
3. Header band with gradient matching the mood; white <h1> with the subject
4. Body cell: draft content as paragraphs; preserve meaning; light formatting only
5. Footer with unsubscribe

COLOR / MOOD (you pick exact hex each time — do NOT default everything to the same blue):
${guidance}

Do not invent long marketing copy. Beautify the given draft; keep it concise for outreach.

Subject: "${safeSubject}"

Draft:
${body}`;

  try {
    const result = await runAICompletion({
      messages: [
        {
          role: "system",
          content:
            "You are an HTML email developer specializing in B2B outreach. Output only complete HTML with inline CSS and table layout. Match the requested mood with varied professional colors — never force a single brand blue on every email. No markdown, no explanations.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.55,
    });

    let cleanHtml = stripFences(result.content)
      .replace(/User Safety:\s*safe/gi, "")
      .replace(/Safety evaluation:[\s\S]*/gi, "")
      .trim();

    if (!cleanHtml || cleanHtml.length < 30 || cleanHtml === "User Safety: safe") {
      return { html: fallbackTemplate(subject, body, style), usedFallback: true };
    }

    if (!cleanHtml.includes("{{unsubscribe_url}}") && !/unsubscribe/i.test(cleanHtml)) {
      cleanHtml = cleanHtml.replace(
        /<\/body>/i,
        `<div style="padding:12px 32px;font-size:12px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;"><a href="{{unsubscribe_url}}" style="color:#64748b;">Unsubscribe</a></div></body>`
      );
    }

    return { html: cleanHtml, usedFallback: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[beautify-email] AI generation failed, using fallback template:", reason);
    return { html: fallbackTemplate(subject, body, style), usedFallback: true, error: reason };
  }
}
