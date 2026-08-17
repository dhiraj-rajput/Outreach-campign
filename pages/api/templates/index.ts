import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const templates = await dbAll("SELECT * FROM templates ORDER BY created_at DESC");
    return res.json(templates);
  }

  if (req.method === "POST") {
    const { name, body } = req.body;
    if (!name || !body) return res.status(400).json({ error: "name and body required" });
    const id = randomUUID();
    await dbRun("INSERT INTO templates (id, name, body) VALUES (?, ?, ?)", [id, name, body]);
    return res.status(201).json(await dbGet("SELECT * FROM templates WHERE id = ?", [id]));
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
