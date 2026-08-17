import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll } from "@/lib/db";
import { resolveEnrollmentEligibility, tracksFor } from "@/lib/enrollment";

// GET /api/lists/[id]/conflicts?workflow_id=...
// Returns how many prospects in this list are already fully blocked from the given
// workflow — i.e. already enrolled in it, or blocked on every track it has (LinkedIn
// contacts active in another LinkedIn campaign, or email contacts who've unsubscribed).
// Without a workflow_id (legacy callers) this falls back to a linkedin-only check.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }

  const listId = req.query.id as string;
  const workflowId = req.query.workflow_id as string | undefined;

  const total = (await dbGet<{ c: number }>(
    "SELECT COUNT(*) as c FROM list_targets WHERE list_id = ?",
    [listId]
  ))?.c ?? 0;

  const targetIds = (await dbAll<{ target_id: string }>(
    "SELECT target_id FROM list_targets WHERE list_id = ?",
    [listId]
  )).map((r) => r.target_id);

  let blocked = 0;
  if (targetIds.length > 0) {
    const workflowTracks = workflowId
      ? [...new Set(
          (await dbAll<{ track: string }>("SELECT DISTINCT track FROM workflow_steps WHERE workflow_id = ?", [workflowId])).map((r) => r.track)
        )]
      : ["linkedin"];
    if (workflowTracks.length === 0) workflowTracks.push("linkedin");

    const elig = await resolveEnrollmentEligibility(workflowId ?? "", workflowTracks, targetIds);
    for (const tid of targetIds) {
      if (elig.alreadyInWorkflow.has(tid)) { blocked++; continue; }
      if (tracksFor(tid, workflowTracks, elig).length === 0) blocked++;
    }
  }

  return res.json({ total, blocked });
}
