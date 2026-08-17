import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet } from "@/lib/db";
import { runAICompletion } from "@/lib/ai/client";
import { requirePaidAccess } from "@/lib/access";

/**
 * Preview AI copy for a workflow step.
 * Uses one sample lead from the selected list to demonstrate personalization,
 * but always returns template tokens ({{first_name}}, {{company}}, …) in the
 * body/subject that should be SAVED on the step so every lead in the queue
 * gets their own values at send time.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const access = await requirePaidAccess(req, res);
  if (!access) return;

  const {
    step_type,
    ai_model,
    ai_prompt,
    ai_language,
    ai_max_words,
    target_id,
    list_id,
    campaign_prompt,
  } = req.body;

  // Resolve sample target: explicit target_id OR first member of list_id
  let targetId = target_id as string | undefined;
  if (!targetId && list_id) {
    // list_targets is (list_id, target_id) only — no created_at column
    const row = await dbGet<{ id: string }>(
        `SELECT t.id FROM targets t
         JOIN list_targets lt ON lt.target_id = t.id
         WHERE lt.list_id = ?
         LIMIT 1`, [list_id]
      );
    targetId = row?.id;
  }

  if (!targetId) {
    return res.status(400).json({
      error: "Select a list that has at least one contact (preview uses the first as a sample).",
    });
  }

  const target = await dbGet<Record<string, unknown>>("SELECT * FROM targets WHERE id = ?", [targetId]);

  if (!target) {
    return res.status(404).json({ error: "Sample contact not found" });
  }

  // Join company row when available for richer context
  let companyRow: Record<string, unknown> | undefined = undefined;
  if (target.company_id) {
    const c = await dbGet<Record<string, unknown>>("SELECT * FROM companies WHERE id = ?", [target.company_id as string]);
    if (c) companyRow = c;
  }

  const leadName =
    (target.full_name as string) ||
    (target.first_name as string) ||
    "Lead";
  const firstName =
    (target.first_name as string) || leadName.split(" ")[0] || "there";
  const lastName = (target.last_name as string) || "";
  const title = (target.title as string) || "";
  const company =
    (target.company as string) ||
    (companyRow?.name as string) ||
    "";
  const location = (target.location as string) || "";
  const industry =
    (companyRow?.industry as string) ||
    (target.industry as string) ||
    "";
  const companyDomain =
    (companyRow?.domain as string) ||
    (target.email as string)?.split("@")[1] ||
    "";

  // Sender identity — never invent "[Your Company]"
  const agent = await dbGet<Record<string, unknown>>("SELECT * FROM agent_config WHERE id = 1");
  // No settings table in this schema — use the first configured email account.
  const emailAcct = await dbGet<{ from_name: string | null; from_email: string; signature: string | null }>(
      "SELECT from_name, from_email, signature FROM email_accounts LIMIT 1"
    );

  const senderName =
    (emailAcct?.from_name as string)?.trim() ||
    (emailAcct?.from_email as string)?.split("@")[0] ||
    "the team";
  const senderEmail = (emailAcct?.from_email as string) || "";
  const senderDomain = senderEmail.includes("@")
    ? senderEmail.split("@")[1]
    : "";
  const senderCompany =
    senderDomain
      .replace(/\.(com|io|co|ai|net|org)$/i, "")
      .replace(/\./g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "our team";

  const isEmail = step_type === "email" || step_type === "newsletter";
  const maxWords = typeof ai_max_words === "number" && ai_max_words > 0 ? ai_max_words : isEmail ? 140 : 50;
  const language = (ai_language as string) || "English";
  const instruction =
    (ai_prompt as string)?.trim() ||
    "Warm B2B outreach. Mention a relevant observation about their role/company and propose a short call.";
  const campaign = (campaign_prompt as string)?.trim() || "";

  const leadContext = [
    `SAMPLE LEAD (for context only — do NOT hardcode this name in the output):`,
    `- full_name: ${leadName}`,
    `- first_name: ${firstName}`,
    `- last_name: ${lastName || "(unknown)"}`,
    `- title: ${title || "(unknown)"}`,
    `- company: ${company || "(unknown)"}`,
    `- location: ${location || "(unknown)"}`,
    `- industry: ${industry || "(unknown)"}`,
    `- company_domain: ${companyDomain || "(unknown)"}`,
  ].join("\n");

  const senderContext = [
    `SENDER (our side — use these real values, never placeholders like [Your Company]):`,
    `- sender_name: ${senderName}`,
    `- sender_email: ${senderEmail || "(not set)"}`,
    `- sender_company: ${senderCompany}`,
  ].join("\n");

  // Rotate the opening angle so back-to-back generations don't converge on the same
  // stock hook ("I noticed {{company}} and thought..." every time). The model still
  // picks freely, but a nudge toward a *specific* angle measurably increases variety.
  const angles = [
    "a likely operational pain point for their role",
    "a recent, plausible trend in their industry (kept general, not a fabricated stat)",
    "a genuine, low-pressure question about how they currently handle the problem",
    "a short, concrete observation about their role or seniority",
    "a light, non-generic opening that skips the word 'noticed' entirely",
  ];
  const angle = angles[Math.floor(Math.random() * angles.length)];

  const groundingRules = `GROUNDING — do not invent facts:
- Only state facts that appear in the SAMPLE LEAD, SENDER, CAMPAIGN BRIEF, or STEP INSTRUCTION blocks below.
- NEVER invent a company name, client/customer name, case study, statistic, integration, award, or product
  feature that was not given to you. If you don't have a concrete detail, stay general
  ("teams like yours", "companies in your space") instead of making one up.
- NEVER attribute the recipient to a company other than the one given in "company" above.
- If you're unsure whether a detail is true, leave it out rather than guess.`;

  const varietyRules = `VARIETY — avoid formulaic, repetitive copy:
- Lead with ${angle}.
- Do not default to the same opening line every time ("I noticed X and thought..." is overused — avoid it
  unless it's genuinely the best fit here).
- Vary sentence length and structure; write like a real person messaged them, not a mail-merge template.`;

  const systemEmail = `You are an expert B2B cold-email copywriter for multi-lead campaigns.

CRITICAL OUTPUT RULES:
1. Return ONLY raw JSON: {"subject":"...","body":"..."}
2. In subject AND body you MUST use template tokens so the same step works for every lead in a list:
   {{first_name}}  {{last_name}}  {{full_name}}  {{company}}  {{title}}  {{location}}
3. NEVER hardcode the sample lead's real name or company into the saved copy.
4. NEVER write bracket placeholders like [Your Company], [Your Name], [solution/service], [Your Title].
5. Use the SENDER fields for the sign-off (real name / real company derived from the mailbox).
6. Write in ${language}. Keep body under ~${maxWords} words. Short paragraphs.
7. No markdown fences, no safety tags, no word-count notes.

${groundingRules}

${varietyRules}

The sample lead below is only to inspire relevance (industry, role). Tokens will be filled per recipient at send time.
Before you output, silently check your draft against the GROUNDING rules and remove anything you can't trace back to the context given.`;

  const systemLinkedIn = `You are an expert B2B LinkedIn outreach writer for multi-lead campaigns.

CRITICAL OUTPUT RULES:
1. Return ONLY raw JSON: {"body":"..."}
2. Body MUST use tokens: {{first_name}} {{company}} {{title}} where natural.
3. NEVER hardcode the sample lead's real name/company.
4. NEVER use [Your Company] / [Your Name] style placeholders.
5. Write in ${language}. Under ~${maxWords} words. Sound human, not salesy.
6. No markdown fences or safety tags.

${groundingRules}

${varietyRules}

Sample lead is context only; tokens are filled per recipient at send time.
Before you output, silently check your draft against the GROUNDING rules and remove anything you can't trace back to the context given.`;

  const userContent = [
    leadContext,
    "",
    senderContext,
    campaign ? `\nCAMPAIGN BRIEF:\n${campaign}` : "",
    `\nSTEP INSTRUCTION:\n${instruction}`,
    isEmail
      ? `\nWrite subject + body as reusable templates with {{tokens}}.`
      : `\nWrite body as a reusable template with {{tokens}}.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await runAICompletion({
      messages: [
        { role: "system", content: isEmail ? systemEmail : systemLinkedIn },
        { role: "user", content: userContent },
      ],
      preferredModel: ai_model || undefined,
      // Slightly higher than before — the GROUNDING rules above now do the job of keeping
      // facts accurate, so temperature is free to add wording/structure variety instead of
      // every generation converging on the same phrasing.
      temperature: 0.7,
      max_tokens: 900,
    });

    let subjectStr = "";
    let bodyStr = "";
    const raw = (result.content || "").trim();

    try {
      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      subjectStr = String(parsed.subject ?? "");
      bodyStr = String(parsed.body ?? parsed.message ?? "");
    } catch {
      // Soft parse: look for subject/body lines
      const subj = raw.match(/"subject"\s*:\s*"((?:\\.|[^"\\])*)"/i);
      const bod = raw.match(/"body"\s*:\s*"((?:\\.|[^"\\])*)"/i);
      if (subj) subjectStr = JSON.parse(`"${subj[1]}"`);
      if (bod) bodyStr = JSON.parse(`"${bod[1]}"`);
      if (!bodyStr) bodyStr = raw;
    }

    // Strip model junk + forbidden placeholder patterns
    let cleanBody = bodyStr
      .replace(/User Safety:\s*safe/gi, "")
      .replace(/Safety evaluation:[\s\S]*/gi, "")
      .replace(/\[Your (Company|Name|Title|Contact Information)\]/gi, senderName === "the team" ? senderCompany : senderName)
      .replace(/\[solution\/service\]/gi, "platform")
      .replace(/\[Your Company\]/gi, senderCompany)
      .trim();

    // If the model still hardcoded the sample name, convert to tokens for save
    const tokenBody = cleanBody
      .replace(new RegExp(`\\b${escapeRegExp(firstName)}\\b`, "gi"), "{{first_name}}")
      .replace(new RegExp(`\\b${escapeRegExp(leadName)}\\b`, "gi"), "{{full_name}}")
      .replace(
        company ? new RegExp(`\\b${escapeRegExp(company)}\\b`, "gi") : /$a/,
        "{{company}}"
      )
      .replace(
        title ? new RegExp(`\\b${escapeRegExp(title)}\\b`, "gi") : /$a/,
        "{{title}}"
      );

    let tokenSubject = (subjectStr || "")
      .replace(new RegExp(`\\b${escapeRegExp(firstName)}\\b`, "gi"), "{{first_name}}")
      .replace(
        company ? new RegExp(`\\b${escapeRegExp(company)}\\b`, "gi") : /$a/,
        "{{company}}"
      );

    if (!tokenBody || tokenBody.length < 10) {
      cleanBody = isEmail
        ? `Hi {{first_name}},\n\nI noticed {{company}} and thought a quick intro could be useful. We help teams like yours move faster without adding headcount.\n\nOpen to a 15-minute chat this week?\n\nBest,\n${senderName}`
        : `Hi {{first_name}} — saw your work at {{company}} and wanted to connect.`;
    } else {
      cleanBody = tokenBody;
    }

    if (!tokenSubject && isEmail) {
      tokenSubject = `Quick idea for {{company}}`;
    }

    // Display versions filled for the sample lead (UI preview only)
    const displayBody = cleanBody
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{last_name\}\}/gi, lastName)
      .replace(/\{\{full_name\}\}/gi, leadName)
      .replace(/\{\{company\}\}/gi, company || "your team")
      .replace(/\{\{title\}\}/gi, title || "your role")
      .replace(/\{\{location\}\}/gi, location);

    const displaySubject = (tokenSubject || "")
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{company\}\}/gi, company || "your team");

    return res.status(200).json({
      // What to SAVE on the step (tokens — works for every lead)
      subject: isEmail ? tokenSubject : undefined,
      body: cleanBody,
      // What to SHOW in the modal (filled for the sample contact)
      preview_subject: isEmail ? displaySubject : undefined,
      preview_body: displayBody,
      sample_lead: leadName,
      sample_company: company,
      input_tokens: result.prompt_tokens ?? 0,
      output_tokens: result.completion_tokens ?? 0,
      cost_usd: 0,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    console.warn("[preview] AI error, template fallback:", err);
    const body = isEmail
      ? `Hi {{first_name}},\n\nI came across {{company}} and wanted to reach out. We help teams in similar roles tighten operations without extra process.\n\nWorth a short call?\n\nBest,\n${senderName}`
      : `Hi {{first_name}}, noticed your work at {{company}} — would be glad to connect.`;
    const subject = isEmail ? `Quick idea for {{company}}` : undefined;
    return res.status(200).json({
      subject,
      body,
      preview_subject: subject?.replace(/\{\{company\}\}/gi, company || "your team"),
      preview_body: body
        .replace(/\{\{first_name\}\}/gi, firstName)
        .replace(/\{\{company\}\}/gi, company || "your team"),
      sample_lead: leadName,
      sample_company: company,
      provider: "fallback",
      model: "template",
    });
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
