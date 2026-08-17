import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const project = await dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!project) return res.status(404).json({ error: "not found" });
    return res.json(project);
  }

  if (req.method === "PUT") {
    const { name, description, url, status } = req.body ?? {};
    await dbRun(
      `UPDATE projects SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         url = COALESCE(?, url),
         status = COALESCE(?, status)
       WHERE id = ?`,
       [name ?? null, description ?? null, url ?? null, status ?? null, id]
    );
    const project = await dbGet("SELECT * FROM projects WHERE id = ?", [id]);
    if (!project) return res.status(404).json({ error: "not found" });
    return res.json(project);
  }

  if (req.method === "DELETE") {
    await dbRun("DELETE FROM projects WHERE id = ?", [id]);
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  res.status(405).end();
}
