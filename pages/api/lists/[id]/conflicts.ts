import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { resolveEnrollmentEligibility, tracksFor } from "@/lib/enrollment";

// GET /api/lists/[id]/conflicts?workflow_id=...
// Returns how many prospects in this list are already fully blocked from the given
// workflow — i.e. already enrolled in it, or blocked on every track it has (LinkedIn
// contacts active in another LinkedIn campaign, or email contacts who've unsubscribed).
// Without a workflow_id (legacy callers) this falls back to a linkedin-only check.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }

  const db = getDb();
  const listId = req.query.id as string;
  const workflowId = req.query.workflow_id as string | undefined;

  const total = (db.prepare(
    "SELECT COUNT(*) as c FROM list_targets WHERE list_id = ?"
  ).get(listId) as { c: number }).c;

  const targetIds = (db.prepare(
    "SELECT target_id FROM list_targets WHERE list_id = ?"
  ).all(listId) as { target_id: string }[]).map((r) => r.target_id);

  let blocked = 0;
  if (targetIds.length > 0) {
    const workflowTracks = workflowId
      ? [...new Set(
          (db.prepare("SELECT DISTINCT track FROM workflow_steps WHERE workflow_id = ?").all(workflowId) as { track: string }[]).map((r) => r.track)
        )]
      : ["linkedin"];
    if (workflowTracks.length === 0) workflowTracks.push("linkedin");

    const elig = resolveEnrollmentEligibility(db, workflowId ?? "", workflowTracks, targetIds);
    for (const tid of targetIds) {
      if (elig.alreadyInWorkflow.has(tid)) { blocked++; continue; }
      if (tracksFor(tid, workflowTracks, elig).length === 0) blocked++;
    }
  }

  return res.json({ total, blocked });
}
