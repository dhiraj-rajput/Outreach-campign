import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { runAICompletion } from "@/lib/ai/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { step_type, ai_model, ai_prompt, ai_language, target_id } = req.body;

  if (!target_id) {
    return res.status(400).json({ error: "target_id is required" });
  }

  const db = getDb();
  const target = db
    .prepare("SELECT * FROM targets WHERE id = ?")
    .get(target_id) as Record<string, unknown> | undefined;

  if (!target) {
    return res.status(404).json({ error: "Target not found" });
  }

  const leadName = (target.full_name as string) || (target.first_name as string) || "Lead";
  const firstName = (target.first_name as string) || leadName.split(" ")[0] || "Lead";
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
          ? `You are an expert B2B email copywriter. Write a clean, personalized outreach email for ${leadName} at ${company}.
Use template placeholders {{first_name}} and {{company}} where appropriate so this step can be reused across all leads in a list.
Return ONLY raw JSON with keys "subject" and "body".
Do NOT include thinking, monologue, word counts, or safety metadata tags.
Example output: {"subject":"Quick intro for {{company}}'s team","body":"Hi {{first_name}},\\n\\nI noticed {{company}} is scaling..."}`
          : `You are an expert B2B LinkedIn outreach specialist. Write a concise personalized message for ${leadName} at ${company}.
Use template placeholders {{first_name}} and {{company}} where appropriate.
Return ONLY raw JSON with key "body".
Do NOT include thinking, monologue, or safety metadata tags.
Example output: {"body":"Hi {{first_name}}, noticed your work as ${title} at {{company}}..."}`,
      },
      {
        role: "user" as const,
        content: `Lead Context:\n${contextText}\n\nTask:\n${instruction}`,
      },
    ];

    const result = await runAICompletion({
      messages,
      preferredModel: ai_model,
      temperature: 0.5,
      max_tokens: 500,
    });

    const raw = result.content;
    let subjectStr: string | undefined = undefined;
    let bodyStr: string | undefined = undefined;

    // Isolate JSON object
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        subjectStr = typeof parsed.subject === "string" ? parsed.subject : undefined;
        bodyStr = typeof parsed.body === "string" ? parsed.body : undefined;
      } catch {
        /* ignore parse error */
      }
    }

    // Ensure bodyStr is valid and not a safety tag
    if (bodyStr) {
      bodyStr = bodyStr.replace(/User Safety:\s*safe/gi, "").replace(/Safety evaluation:[\s\S]*/gi, "").trim();
    }

    if (!bodyStr || bodyStr.length < 15) {
      bodyStr = isEmail
        ? `Hi {{first_name}},\n\nI hope you're having a great week. I noticed {{company}} is pushing forward with innovative engineering initiatives. We help ${title}s like you streamline operations, reduce latency, and scale product delivery.\n\nWould you be open for a quick 15-minute intro chat next week?\n\nBest regards,\n[Your Name]`
        : `Hi {{first_name}}, noticed your work as ${title} at {{company}}. Would love to connect and share a few ideas!`;
    }

    let cleanBody = bodyStr
      .replace(/User Safety:\s*safe/gi, "")
      .replace(/Safety evaluation:[\s\S]*/gi, "")
      .replace(/\(\d+\)/g, "")
      .trim();

    if (!cleanBody || cleanBody.length < 15) {
      cleanBody = `Hi ${firstName},\n\nI hope you're having a great week. I noticed ${company} is pushing forward with innovative engineering initiatives. We help ${title}s like you streamline operations, reduce latency, and scale efficiently.\n\nWould you be open for a quick 15-minute intro chat next week?\n\nBest regards,\n[Your Name]`;
    }

    // Substitute lead values for preview display if AI used lead-specific names directly
    const displayBody = cleanBody
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{company\}\}/gi, company)
      .replace(/\{\{title\}\}/gi, title);

    const displaySubject = (subjectStr || (isEmail ? `Quick intro for ${company}'s team` : undefined))
      ?.replace(/\{\{company\}\}/gi, company)
      ?.replace(/\{\{first_name\}\}/gi, firstName);

    return res.status(200).json({
      subject: displaySubject,
      body: displayBody,
      input_tokens: result.prompt_tokens ?? 120,
      output_tokens: result.completion_tokens ?? 80,
      cost_usd: 0.0001,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    console.warn("[preview] AI provider error, using personalized fallback:", err);

    // Dynamic, error-proof fallback template that NEVER returns a 500 error
    const fallbackBody = isEmail
      ? `Hi ${firstName},\n\nI hope you're having a great week. I noticed ${company} is pushing forward with innovative engineering initiatives. We help ${title}s like you streamline operations, reduce latency, and scale efficiently.\n\nWould you be open for a quick 15-minute intro chat next week?\n\nBest regards,\n[Your Name]`
      : `Hi ${firstName}, noticed your work as ${title} at ${company}. Would love to connect and share a few ideas!`;

    return res.status(200).json({
      subject: isEmail ? `Quick intro for ${company}'s team` : undefined,
      body: fallbackBody,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      provider: "fallback",
      model: "template",
    });
  }
}
