/**
 * PATCH  /api/pipeline/deals/:id   → update stage/title/value/notes/position
 * DELETE /api/pipeline/deals/:id
 * Paid feature: gated by requirePaidAccess.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { requirePaidAccess } from "@/lib/access";

const STAGES = new Set(["new", "contacted", "qualified", "proposal", "won", "lost"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await requirePaidAccess(req, res);
  if (!access) return;

  const id = req.query.id as string;
  const db = getDb();

  if (req.method === "PATCH") {
    const { title, stage, value, notes, position, target_id, company_id } = req.body as {
      title?: string;
      stage?: string;
      value?: number;
      notes?: string;
      position?: number;
      target_id?: string | null;
      company_id?: string | null;
    };

    if (stage !== undefined && !STAGES.has(stage)) {
      return res.status(400).json({ error: `stage must be one of ${[...STAGES].join(", ")}` });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    if (title !== undefined) { fields.push("title = ?"); params.push(title); }
    if (stage !== undefined) { fields.push("stage = ?"); params.push(stage); }
    if (value !== undefined) { fields.push("value = ?"); params.push(value); }
    if (notes !== undefined) { fields.push("notes = ?"); params.push(notes); }
    if (position !== undefined) { fields.push("position = ?"); params.push(position); }
    if (target_id !== undefined) { fields.push("target_id = ?"); params.push(target_id); }
    if (company_id !== undefined) { fields.push("company_id = ?"); params.push(company_id); }
    fields.push("updated_at = datetime('now')");

    if (fields.length === 1) return res.status(400).json({ error: "Nothing to update" });

    params.push(id);
    db.prepare(`UPDATE pipeline_deals SET ${fields.join(", ")} WHERE id = ?`).run(...params);

    const deal = db
      .prepare(
        `SELECT d.*, t.full_name as contact_name, c.name as company_name
         FROM pipeline_deals d
         LEFT JOIN targets t ON t.id = d.target_id
         LEFT JOIN companies c ON c.id = d.company_id
         WHERE d.id = ?`
      )
      .get(id);
    if (!deal) return res.status(404).json({ error: "Deal not found" });
    return res.status(200).json({ deal });
  }

  if (req.method === "DELETE") {
    db.prepare("DELETE FROM pipeline_deals WHERE id = ?").run(id);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["PATCH", "DELETE"]);
  return res.status(405).end();
}
