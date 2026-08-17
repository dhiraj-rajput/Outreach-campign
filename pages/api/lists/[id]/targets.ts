import type { NextApiRequest, NextApiResponse } from "next";
import { dbRun } from "@/lib/db";

// DELETE /api/lists/[id]/targets  body: { target_ids: number[] }
// Removes targets from the list (list_targets rows only, does not delete the target itself)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", ["DELETE"]);
    return res.status(405).end();
  }

  const listId = req.query.id as string;
  const { target_ids } = req.body as { target_ids: string[] };

  if (!Array.isArray(target_ids) || target_ids.length === 0) {
    return res.status(400).json({ error: "target_ids must be a non-empty array" });
  }

  const placeholders = target_ids.map(() => "?").join(",");
  await dbRun(
    `DELETE FROM list_targets WHERE list_id = ? AND target_id IN (${placeholders})`,
    [listId, ...target_ids]
  );

  return res.json({ removed: target_ids.length });
}
