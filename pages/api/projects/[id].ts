import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const id = req.query.id as string;

  if (req.method === "GET") {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!project) return res.status(404).json({ error: "not found" });
    return res.json(project);
  }

  if (req.method === "PUT") {
    const { name, description, url, status } = req.body ?? {};
    db.prepare(
      `UPDATE projects SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         url = COALESCE(?, url),
         status = COALESCE(?, status)
       WHERE id = ?`
    ).run(name ?? null, description ?? null, url ?? null, status ?? null, id);
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    if (!project) return res.status(404).json({ error: "not found" });
    return res.json(project);
  }

  if (req.method === "DELETE") {
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  res.status(405).end();
}
