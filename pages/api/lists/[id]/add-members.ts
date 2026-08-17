import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbTransaction } from "@/lib/db";

// Add EXISTING contacts to a list by id (membership only — does not create
// contacts). Idempotent: already-member ids are skipped. This is the inverse of
// remove-members and the way to UNDO a removal (feed back removed_contact_ids).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const list_id = req.query.id as string;

  const list = await dbGet("SELECT id FROM lists WHERE id = ?", [list_id]);
  if (!list) return res.status(404).json({ error: "List not found" });

  const { contact_ids } = req.body as { contact_ids?: string[] };
  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return res.status(400).json({ error: "contact_ids[] is required." });
  }

  // Only add ids that actually exist as contacts (ignore unknown ids rather
  // than failing the whole batch).
  const placeholders = contact_ids.map(() => "?").join(", ");
  const existing = await dbAll<{ id: string; full_name: string | null; title: string | null }>(
    `SELECT id, full_name, title FROM targets WHERE id IN (${placeholders})`,
    contact_ids
  );
  const existingIds = new Set(existing.map((r) => r.id));
  const unknown = contact_ids.filter((id) => !existingIds.has(id));

  let added = 0;
  await dbTransaction(async (conn) => {
    if (existingIds.size > 0) {
      const ids = [...existingIds];
      const linkValues = ids.map(() => "(?, ?)").join(", ");
      const linkParams = ids.flatMap((id) => [list_id, id]);
      const [result] = await conn.execute(
        `INSERT IGNORE INTO list_targets (list_id, target_id) VALUES ${linkValues}`,
        linkParams
      ) as [any, any];
      added = result.affectedRows;
    }
  });

  const totalRow = await dbGet<{ c: number }>("SELECT COUNT(*) as c FROM list_targets WHERE list_id = ?", [list_id]);
  const total = totalRow?.c ?? 0;

  return res.json({
    added,
    already_members: existingIds.size - added,
    unknown_contact_ids: unknown,
    list_total: total,
    contacts_added: existing,
  });
}
