import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// Direct port of PPT-Agent's backend/app/routes/campaigns.py::beautify_email(). PPT-Agent's
// version calls its own internal AI client (Ollama → Gemini → OpenRouter fallback chain);
// linki's equivalent multi-provider AI plumbing (premium.ai) lives in the ee/-only build and
// is not present in this zip (see 01-comparison-report.md §1/§5), so this module talks to
// OpenRouter directly using the same `integrations` row (key = 'openrouter') the rest of the
// app already uses for AI calls (see lib/linkedin/runner.ts). If no key/model is configured,
// or the call fails for any reason, it degrades to the same styled fallback template
// PPT-Agent falls back to — beautify never blocks the user from sending.

export type BeautifyStyle = "professional" | "friendly" | "bold";

const STYLE_DESCRIPTIONS: Record<BeautifyStyle, string> = {
  professional: "Clean, corporate, navy and white tones, formal language",
  friendly: "Warm, approachable, light blues and greens, conversational tone",
  bold: "High-impact, dark background with bright accents, confident language",
};

export interface BeautifyResult {
  html: string;
  usedFallback: boolean;
  error?: string;
}

function fallbackTemplate(subject: string, body: string): string {
  const escapedBody = body.replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html><body style='margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;'>
<table width='100%' cellpadding='0' cellspacing='0'><tr><td align='center' style='padding:30px 0;'>
<table width='600' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:8px;overflow:hidden;'>
<tr><td style='background:#1a237e;padding:30px 40px;'>
  <h1 style='color:#ffffff;margin:0;font-size:24px;'>${subject || "Important Message"}</h1>
</td></tr>
<tr><td style='padding:30px 40px;color:#333333;font-size:15px;line-height:1.6;'>
  ${escapedBody}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function stripFences(html: string): string {
  let out = html.trim();
  if (out.startsWith("```")) out = out.includes("\n") ? out.split("\n").slice(1).join("\n") : out.slice(3);
  if (out.endsWith("```")) out = out.includes("\n") ? out.split("\n").slice(0, -1).join("\n") : out.slice(0, -3);
  return out.trim();
}

/**
 * Convert a plain-text email draft into a responsive, inline-CSS HTML email.
 * Mirrors PPT-Agent's three style presets and always returns *something renderable* —
 * `usedFallback: true` tells the caller the AI call didn't succeed.
 */
export async function beautifyEmail(
  subject: string,
  body: string,
  style: BeautifyStyle = "professional"
): Promise<BeautifyResult> {
  const db = getDb();
  const integration = db.prepare("SELECT api_key FROM integrations WHERE key = 'openrouter'").get() as
    { api_key: string } | undefined;
  const agentConfig = db.prepare("SELECT default_model FROM agent_config WHERE id = 1").get() as
    { default_model: string | null } | undefined;

  const apiKey = integration?.api_key ? decryptSecret(integration.api_key) : null;
  const model = agentConfig?.default_model;

  if (!apiKey || !model) {
    return { html: fallbackTemplate(subject, body), usedFallback: true, error: "OpenRouter key or default model not configured" };
  }

  const styleDesc = STYLE_DESCRIPTIONS[style] ?? STYLE_DESCRIPTIONS.professional;
  const prompt = `You are an expert HTML email designer. Convert this plain-text email draft into a beautiful, responsive HTML email.

Return ONLY valid HTML — no markdown, no code fences, no explanation.

Design rules:
- Use ONLY inline CSS (required for email client compatibility)
- Max-width: 600px, centered with margin: 0 auto
- Clean card layout: white body (#ffffff), light grey background (#f4f4f4)
- Colored header banner with the subject as headline (large, bold, white text)
- Body text: Arial/Helvetica, 15px, #333333, line-height 1.6
- Section padding: 30px 40px
- Style theme: ${styleDesc}
- Subject/Headline: "${subject}"

Plain text draft:
${body}`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "system",
            content: "You are an expert HTML email designer. You respond with ONLY raw HTML — no markdown, no code fences, no commentary before or after the HTML.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content as string | undefined;
    if (!raw || !raw.trim()) throw new Error("AI returned an empty response");

    return { html: stripFences(raw), usedFallback: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[beautify-email] AI generation failed, using fallback template:", reason);
    return { html: fallbackTemplate(subject, body), usedFallback: true, error: reason };
  }
}
