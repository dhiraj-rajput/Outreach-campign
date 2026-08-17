import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const workflows = await dbAll(
        `SELECT w.*, COUNT(ws.id) as step_count
         FROM workflows w
         LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
         GROUP BY w.id
         ORDER BY w.created_at DESC`
      );
    return res.json(workflows);
  }

  if (req.method === "POST") {
    const { name, description, prompt } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const id = randomUUID();
    await dbRun("INSERT INTO workflows (id, name, description, prompt) VALUES (?, ?, ?, ?)", [id, name, description ?? null, prompt ?? null]);
    return res.status(201).json(await dbGet("SELECT * FROM workflows WHERE id = ?", [id]));
  }

  res.status(405).end();
}
