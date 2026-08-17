import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const sourceId = req.query.id as string;

  const source = await dbGet<{ id: string; name: string; description: string | null }>("SELECT * FROM workflows WHERE id = ?", [sourceId]);
  if (!source) return res.status(404).json({ error: "Workflow not found" });

  const newId = randomUUID();
  await dbRun("INSERT INTO workflows (id, name, description) VALUES (?, ?, ?)", [
    newId,
    `${source.name} (copy)`,
    source.description ?? null
  ]);

  const steps = await dbAll<Record<string, unknown>>("SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY step_order", [sourceId]);

  for (const s of steps) {
    const newStepId = randomUUID();
    await dbRun(
      `INSERT INTO workflow_steps
         (id, workflow_id, step_order, step_type, template_id, delay_seconds,
          connect_note, message_body, email_subject, email_body,
          email_position, message_position,
          ai_enabled, ai_model, ai_prompt, ai_max_words, ai_language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
       [
        newStepId, newId, s.step_order, s.step_type,
        s.template_id ?? null, s.delay_seconds ?? 0,
        s.connect_note ?? null, s.message_body ?? null,
        s.email_subject ?? null, s.email_body ?? null,
        s.email_position ?? 1, s.message_position ?? 1,
        s.ai_enabled ?? 0, s.ai_model ?? null,
        s.ai_prompt ?? null, s.ai_max_words ?? null,
        s.ai_language ?? null
       ]
    );
    const links = await dbAll<{ template_id: string }>("SELECT template_id FROM workflow_step_templates WHERE step_id = ?", [s.id as string]);
    for (const { template_id } of links) {
      await dbRun("INSERT IGNORE INTO workflow_step_templates (step_id, template_id) VALUES (?, ?)", [newStepId, template_id]);
    }
  }

  return res.status(201).json({ id: newId });
}
