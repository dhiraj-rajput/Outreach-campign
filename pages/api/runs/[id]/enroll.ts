import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { resolveEnrollmentEligibility, tracksFor } from "@/lib/enrollment";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const db = getDb();
  const runId = req.query.id as string;
  const { target_ids } = req.body as { target_ids?: string[] };

  if (!Array.isArray(target_ids) || target_ids.length === 0) {
    return res.status(400).json({ error: "target_ids required" });
  }

  const run = db
    .prepare("SELECT id, workflow_id FROM runs WHERE id = ?")
    .get(runId) as { id: string; workflow_id: string } | undefined;
  if (!run) return res.status(404).json({ error: "run_not_found" });

  // Tracks defined on this workflow
  const workflowTracks = [...new Set(
    (db.prepare("SELECT DISTINCT track FROM workflow_steps WHERE workflow_id = ?").all(run.workflow_id) as { track: string }[]).map((r) => r.track)
  )];
  if (workflowTracks.length === 0) workflowTracks.push("linkedin");

  // Existing email-account pool for this run (used as round-robin pool for new enrollments)
  const emailAccountPool: string[] = (db
    .prepare(
      `SELECT DISTINCT email_account_id FROM run_profiles
       WHERE run_id = ? AND email_account_id IS NOT NULL`
    )
    .all(runId) as Array<{ email_account_id: string }>).map((r) => r.email_account_id);

  // Per-channel eligibility — see lib/enrollment.ts for the rules.
  const elig = resolveEnrollmentEligibility(db, run.workflow_id, workflowTracks, target_ids);

  let skipped_already_enrolled = 0;
  let skipped_linkedin_active_elsewhere = 0;
  let skipped_unsubscribed = 0;
  const eligible: string[] = [];
  const targetTracks = new Map<string, string[]>();
  for (const tid of target_ids) {
    if (elig.alreadyInWorkflow.has(tid)) { skipped_already_enrolled++; continue; }
    const tracks = tracksFor(tid, workflowTracks, elig);
    if (tracks.length === 0) {
      // Every track this workflow has was blocked for this target — report the most
      // relevant reason (LinkedIn conflict takes priority since it's the harder block).
      if (workflowTracks.includes("linkedin") && elig.linkedinBlockedElsewhere.has(tid)) skipped_linkedin_active_elsewhere++;
      else skipped_unsubscribed++;
      continue;
    }
    eligible.push(tid);
    targetTracks.set(tid, tracks);
  }

  if (eligible.length === 0) {
    return res.json({ enrolled: 0, skipped_already_enrolled, skipped_linkedin_active_elsewhere, skipped_unsubscribed });
  }

  // Assign email accounts: company-grouped round-robin (same as run creation)
  const emailAssignment = new Map<string, string | null>();
  if (emailAccountPool.length > 0) {
    const placeholders = eligible.map(() => "?").join(",");
    const companyRows = db
      .prepare(`SELECT id, company_id FROM targets WHERE id IN (${placeholders})`)
      .all(...eligible) as { id: string; company_id: string | null }[];
    const companyAccountMap = new Map<string, string>();
    let cursor = 0;
    for (const row of companyRows) {
      if (row.company_id) {
        if (!companyAccountMap.has(row.company_id)) {
          companyAccountMap.set(row.company_id, emailAccountPool[cursor % emailAccountPool.length]);
          cursor++;
        }
        emailAssignment.set(row.id, companyAccountMap.get(row.company_id)!);
      } else {
        emailAssignment.set(row.id, emailAccountPool[cursor % emailAccountPool.length]);
        cursor++;
      }
    }
  }

  const insertProfile = db.prepare(
    "INSERT INTO run_profiles (id, run_id, target_id, email_account_id) VALUES (?, ?, ?, ?)"
  );
  const insertTrack = db.prepare(
    "INSERT INTO run_profile_tracks (id, run_profile_id, track, state, current_step) VALUES (?, ?, ?, 'pending', 0)"
  );
  const insertMany = db.transaction((ids: string[]) => {
    for (const tid of ids) {
      const assignedEmailAccountId = emailAssignment.get(tid) ?? null;
      const rpId = randomUUID();
      insertProfile.run(rpId, runId, tid, assignedEmailAccountId);
      for (const track of targetTracks.get(tid)!) {
        if (track === "email" && !assignedEmailAccountId) continue;
        insertTrack.run(randomUUID(), rpId, track);
      }
    }
  });
  insertMany(eligible);

  return res.json({
    enrolled: eligible.length,
    skipped_already_enrolled,
    skipped_linkedin_active_elsewhere,
    skipped_unsubscribed,
  });
}
