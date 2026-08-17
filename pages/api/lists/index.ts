import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbRun, dbGet } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const lists = await dbAll(
      `SELECT l.*, COUNT(lt.target_id) as target_count
       FROM lists l
       LEFT JOIN list_targets lt ON lt.list_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at DESC`
    );
    return res.json(lists);
  }

  if (req.method === "POST") {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const id = randomUUID();
    await dbRun("INSERT INTO lists (id, name, description) VALUES (?, ?, ?)", [id, name, description ?? null]);
    return res.status(201).json(await dbGet("SELECT * FROM lists WHERE id = ?", [id]));
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
