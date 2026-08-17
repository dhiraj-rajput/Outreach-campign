import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet } from "@/lib/db";
import { cancelImport } from "@/lib/import-jobs";

/** POST — cancel an import batch. A running batch stops at its next page boundary. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }
  const id = req.query.id as string;

  const job = await dbGet<{ id: string; status: string }>("SELECT id, status FROM list_imports WHERE id = ?", [id]);
  if (!job) return res.status(404).json({ error: "Import not found" });

  await cancelImport(id);
  return res.json({ ok: true });
}
