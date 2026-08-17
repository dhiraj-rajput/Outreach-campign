import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet } from "@/lib/db";
import { importCsv } from "@/lib/csv-import";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const listId = req.query.id as string;

  const list = await dbGet<{ id: string }>("SELECT id FROM lists WHERE id = ?", [listId]);
  if (!list) return res.status(404).json({ error: "List not found" });

  const { csv } = req.body as { csv?: string };
  if (!csv || typeof csv !== "string" || !csv.trim()) {
    return res.status(400).json({ error: "csv content is required" });
  }

  const result = await importCsv(null, listId, csv);
  res.json(result);
}
