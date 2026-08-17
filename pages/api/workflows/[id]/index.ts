import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const workflow = await dbGet("SELECT * FROM workflows WHERE id = ?", [id]);
    if (!workflow) return res.status(404).json({ error: "not found" });
    const steps = await dbAll(
        `SELECT ws.*, t.name as template_name
         FROM workflow_steps ws
         LEFT JOIN templates t ON t.id = ws.template_id
         WHERE ws.workflow_id = ?
         ORDER BY ws.step_order`,
         [id]
      );
    return res.json({ ...workflow as object, steps });
  }

  if (req.method === "PUT") {
    const { name, description, prompt } = req.body;
    // name/description: COALESCE so a rename-only request doesn't null them out
    // prompt: always update when present in body (even "" to clear it)
    if (prompt !== undefined) {
      await dbRun(
        "UPDATE workflows SET name = COALESCE(?, name), description = COALESCE(?, description), prompt = ? WHERE id = ?",
        [name ?? null, description ?? null, prompt || null, id]
      );
    } else {
      await dbRun(
        "UPDATE workflows SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?",
        [name ?? null, description ?? null, id]
      );
    }
    return res.json(await dbGet("SELECT * FROM workflows WHERE id = ?", [id]));
  }

  if (req.method === "PATCH") {
    const { is_archived } = req.body;
    if (is_archived !== undefined) {
      await dbRun("UPDATE workflows SET is_archived = ? WHERE id = ?", [is_archived ? 1 : 0, id]);
    }
    return res.json(await dbGet("SELECT * FROM workflows WHERE id = ?", [id]));
  }

  if (req.method === "DELETE") {
    await dbRun("DELETE FROM runs WHERE workflow_id = ?", [id]);
    await dbRun("DELETE FROM workflows WHERE id = ?", [id]);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
