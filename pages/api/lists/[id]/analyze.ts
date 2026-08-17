import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll } from "@/lib/db";

// Title + location breakdown for a list — used to spot irrelevant contacts before cleaning.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const list_id = req.query.id as string;

  const list = await dbGet("SELECT id, name FROM lists WHERE id = ?", [list_id]);
  if (!list) return res.status(404).json({ error: "List not found" });

  const total = (await dbGet<{ c: number }>("SELECT COUNT(*) as c FROM list_targets WHERE list_id = ?", [list_id]))?.c ?? 0;

  const titles = await dbAll(`
    SELECT t.title, COUNT(*) as count
    FROM list_targets lt
    JOIN targets t ON t.id = lt.target_id
    WHERE lt.list_id = ? AND t.title IS NOT NULL
    GROUP BY t.title
    ORDER BY count DESC
  `, [list_id]);

  const locations = await dbAll(`
    SELECT t.location, COUNT(*) as count
    FROM list_targets lt
    JOIN targets t ON t.id = lt.target_id
    WHERE lt.list_id = ? AND t.location IS NOT NULL
    GROUP BY t.location
    ORDER BY count DESC
  `, [list_id]);

  return res.json({ list, total, titles, locations });
}
