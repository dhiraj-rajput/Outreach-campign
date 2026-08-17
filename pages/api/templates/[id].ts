import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const t = await dbGet("SELECT * FROM templates WHERE id = ?", [id]);
    if (!t) return res.status(404).json({ error: "Not found" });
    return res.json(t);
  }

  if (req.method === "PUT") {
    const { name, body } = req.body;
    await dbRun(
      "UPDATE templates SET name = COALESCE(?, name), body = COALESCE(?, body) WHERE id = ?",
      [name, body, id]
    );
    return res.json(await dbGet("SELECT * FROM templates WHERE id = ?", [id]));
  }

  if (req.method === "DELETE") {
    await dbRun("DELETE FROM templates WHERE id = ?", [id]);
    return res.status(204).end();
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  res.status(405).end();
}
