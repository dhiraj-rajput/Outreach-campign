import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbTransaction } from "@/lib/db";

// POST /api/lists/[id]/move-targets
// body: { target_ids: string[], destination_list_id: string }
// Moves targets from source list to destination list (removes from source, adds to destination)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const sourceListId = req.query.id as string;
  const { target_ids, destination_list_id } = req.body as {
    target_ids: string[];
    destination_list_id: string;
  };

  if (!Array.isArray(target_ids) || target_ids.length === 0)
    return res.status(400).json({ error: "target_ids must be a non-empty array" });
  if (!destination_list_id)
    return res.status(400).json({ error: "destination_list_id required" });
  if (destination_list_id === sourceListId)
    return res.status(400).json({ error: "Source and destination list are the same" });

  const dest = await dbGet("SELECT id FROM lists WHERE id = ?", [destination_list_id]);
  if (!dest) return res.status(404).json({ error: "Destination list not found" });

  const placeholders = target_ids.map(() => "?").join(",");

  await dbTransaction(async (conn) => {
    await conn.execute(
      `DELETE FROM list_targets WHERE list_id = ? AND target_id IN (${placeholders})`,
      [sourceListId, ...target_ids]
    );

    const insertValues = target_ids.map(() => "(?, ?)").join(",");
    const insertParams = target_ids.flatMap((tid) => [destination_list_id, tid]);
    
    if (target_ids.length > 0) {
      await conn.execute(
        `INSERT IGNORE INTO list_targets (list_id, target_id) VALUES ${insertValues}`,
        insertParams
      );
    }
  });

  return res.json({ moved: target_ids.length });
}
