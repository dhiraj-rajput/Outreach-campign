import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbRun } from "@/lib/db";
import { ensureGlobalRunnerStarted } from "@/lib/linkedin/runner";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const id = req.query.id as string;

  const run = await dbGet<{ status: string }>("SELECT status FROM runs WHERE id = ?", [id]);
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status === "running") return res.status(400).json({ error: "Run already running" });

  await dbRun(
    "UPDATE runs SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = ?",
    [id]
  );

  await ensureGlobalRunnerStarted();

  return res.json({ ok: true });
}
