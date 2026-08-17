import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";
import { coerceAiEnabled } from "@/lib/access";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const workflowId = req.query.id as string;

  if (req.method === "GET") {
    const steps = await dbAll<Record<string, unknown>>(
        `SELECT ws.*, t.name as template_name
         FROM workflow_steps ws
         LEFT JOIN templates t ON t.id = ws.template_id
         WHERE ws.workflow_id = ?
         ORDER BY ws.track, ws.step_order`,
         [workflowId]
      );

    // Attach multi-template ids to each step
    const stepsWithTemplates = await Promise.all(steps.map(async (s) => {
      const links = await dbAll<{ template_id: string; name: string }>(
        `SELECT wst.template_id, t.name
         FROM workflow_step_templates wst
         JOIN templates t ON t.id = wst.template_id
         WHERE wst.step_id = ?`,
         [s.id as string]
      );
      return {
        ...s,
        template_ids: links.map((r) => r.template_id),
        template_names: links.map((r) => r.name),
      };
    }));

    return res.json(stepsWithTemplates);
  }

  if (req.method === "POST") {
    const { step_type, track: trackIn, template_id, template_ids, newsletter_id, delay_seconds, connect_note, message_body, email_subject, email_body, email_body_html, email_use_html, email_signature, email_position, message_position, ai_enabled, ai_model, ai_prompt, ai_max_words, ai_language } = req.body;
    if (!step_type) return res.status(400).json({ error: "step_type required" });

    // Auto-assign track: email or newsletter step_type always goes on the email track; everything else linkedin
    const track: "linkedin" | "email" = trackIn === "email" || step_type === "email" || step_type === "newsletter" ? "email" : "linkedin";

    const maxRow = await dbGet<{ max_order: number | null }>(
      "SELECT MAX(step_order) as max_order FROM workflow_steps WHERE workflow_id = ? AND track = ?",
      [workflowId, track]
    );
    const nextOrder = (maxRow?.max_order ?? 0) + 1;

    // AI is a paid feature — never trust ai_enabled straight from the request body.
    // A free user's UI never sends true here, but this is the actual enforcement point:
    // the write is what feeds the send runner, not the button that's visible on screen.
    const safeAiEnabled = await coerceAiEnabled(req, res, ai_enabled);

    const id = randomUUID();
    await dbRun(
      "INSERT INTO workflow_steps (id, workflow_id, step_order, track, step_type, template_id, newsletter_id, delay_seconds, connect_note, message_body, email_subject, email_body, email_body_html, email_use_html, email_signature, email_position, message_position, ai_enabled, ai_model, ai_prompt, ai_max_words, ai_language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, workflowId, nextOrder, track, step_type, template_id ?? null, newsletter_id ?? null, delay_seconds ?? 0, connect_note ?? null, message_body ?? null, email_subject ?? null, email_body ?? null, email_body_html ?? null, email_use_html ? 1 : 0, email_signature !== undefined ? email_signature : null, email_position ?? 1, message_position ?? 1, safeAiEnabled ? 1 : 0, ai_model ?? null, ai_prompt ?? null, ai_max_words ?? null, ai_language ?? null]
    );

    // Insert multi-template associations
    if (Array.isArray(template_ids) && template_ids.length > 0) {
      for (const tid of template_ids) {
        await dbRun("INSERT IGNORE INTO workflow_step_templates (step_id, template_id) VALUES (?, ?)", [id, tid]);
      }
    }

    return res.status(201).json({ id });
  }

  res.status(405).end();
}
