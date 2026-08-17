import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const list = await dbGet("SELECT * FROM lists WHERE id = ?", [id]);
    if (!list) return res.status(404).json({ error: "Not found" });
    const targets = await dbAll(
      `SELECT t.* FROM targets t
       JOIN list_targets lt ON lt.target_id = t.id
       WHERE lt.list_id = ?
       ORDER BY t.created_at DESC`, [id]
    );
    return res.json({ ...list, targets });
  }

  if (req.method === "PUT") {
    const { name, description } = req.body;
    await dbRun(
      "UPDATE lists SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?",
      [name, description, id]
    );
    return res.json(await dbGet("SELECT * FROM lists WHERE id = ?", [id]));
  }

  if (req.method === "DELETE") {
    await dbRun("DELETE FROM runs WHERE list_id = ?", [id]);
    await dbRun("DELETE FROM lists WHERE id = ?", [id]);
    return res.status(204).end();
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  res.status(405).end();
}
