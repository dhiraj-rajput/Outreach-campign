import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun, dbTransaction } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const target = await dbGet("SELECT * FROM targets WHERE id = ?", [id]);
    if (!target) return res.status(404).json({ error: "Not found" });

    const company = await dbGet("SELECT * FROM companies WHERE id = (SELECT company_id FROM targets WHERE id = ?)", [id]);
    const lists = await dbAll(`
      SELECT l.id, l.name FROM lists l
      INNER JOIN list_targets lt ON lt.list_id = l.id
      WHERE lt.target_id = ?
      ORDER BY l.name
    `, [id]);

    return res.json({ ...target as object, company: company ?? null, lists });
  }

  if (req.method === "PATCH") {
    const target = await dbGet("SELECT id FROM targets WHERE id = ?", [id]);
    if (!target) return res.status(404).json({ error: "Not found" });

    // Editable contact fields (CRM hygiene). Anything else is owned by enrichment/automation.
    const EDITABLE = [
      "first_name", "last_name", "full_name", "title", "company", "location",
      "email", "phone", "headline", "summary", "notes",
    ] as const;

    const body = req.body as Record<string, unknown>;
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const col of EDITABLE) {
      if (body[col] !== undefined) {
        const v = body[col];
        fields.push(`${col} = ?`);
        params.push(typeof v === "string" ? (v.trim() || null) : v);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: "No editable fields provided" });
    params.push(id);
    await dbRun(`UPDATE targets SET ${fields.join(", ")} WHERE id = ?`, params);

    return res.json(await dbGet("SELECT * FROM targets WHERE id = ?", [id]));
  }

  if (req.method === "DELETE") {
    const target = await dbGet("SELECT id FROM targets WHERE id = ?", [id]);
    if (!target) return res.status(404).json({ error: "Not found" });
    // Some references (run_profiles, logs) have no ON DELETE CASCADE — clear them first so the
    // FK constraint doesn't block the delete. run_profile_tracks cascade off run_profiles.
    await dbTransaction(async (conn) => {
      await conn.execute("DELETE FROM run_profiles WHERE target_id = ?", [id]);
      await conn.execute("DELETE FROM logs WHERE target_id = ?", [id]);
      await conn.execute("DELETE FROM targets WHERE id = ?", [id]);
    });
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  return res.status(405).end();
}
