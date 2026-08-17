import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbTransaction } from "@/lib/db";
import { randomUUID } from "crypto";
import { resolveEnrollmentEligibility, tracksFor } from "@/lib/enrollment";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const runId = req.query.id as string;
  const { target_ids } = req.body as { target_ids?: string[] };

  if (!Array.isArray(target_ids) || target_ids.length === 0) {
    return res.status(400).json({ error: "target_ids required" });
  }

  const run = await dbGet<{ id: string; workflow_id: string }>(
    "SELECT id, workflow_id FROM runs WHERE id = ?",
    [runId]
  );
  if (!run) return res.status(404).json({ error: "run_not_found" });

  // Tracks defined on this workflow
  const trackRows = await dbAll<{ track: string }>(
    "SELECT DISTINCT track FROM workflow_steps WHERE workflow_id = ?",
    [run.workflow_id]
  );
  const workflowTracks = [...new Set(trackRows.map((r) => r.track))];
  if (workflowTracks.length === 0) workflowTracks.push("linkedin");

  // Existing email-account pool for this run (used as round-robin pool for new enrollments)
  const emailAccountRows = await dbAll<{ email_account_id: string }>(`
    SELECT DISTINCT email_account_id FROM run_profiles
    WHERE run_id = ? AND email_account_id IS NOT NULL
  `, [runId]);
  const emailAccountPool: string[] = emailAccountRows.map((r) => r.email_account_id);

  // Per-channel eligibility — see lib/enrollment.ts for the rules.
  const elig = await resolveEnrollmentEligibility(run.workflow_id, workflowTracks, target_ids);

  let skipped_already_enrolled = 0;
  let skipped_linkedin_active_elsewhere = 0;
  let skipped_unsubscribed = 0;
  const eligible: string[] = [];
  const targetTracks = new Map<string, string[]>();
  for (const tid of target_ids) {
    if (elig.alreadyInWorkflow.has(tid)) { skipped_already_enrolled++; continue; }
    const tracks = tracksFor(tid, workflowTracks, elig);
    if (tracks.length === 0) {
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
    const companyRows = await dbAll<{ id: string; company_id: string | null }>(
      `SELECT id, company_id FROM targets WHERE id IN (${placeholders})`,
      eligible
    );
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

  await dbTransaction(async (conn) => {
    for (const tid of eligible) {
      const assignedEmailAccountId = emailAssignment.get(tid) ?? null;
      const rpId = randomUUID();
      await conn.execute(
        "INSERT INTO run_profiles (id, run_id, target_id, email_account_id) VALUES (?, ?, ?, ?)",
        [rpId, runId, tid, assignedEmailAccountId]
      );
      for (const track of targetTracks.get(tid)!) {
        if (track === "email" && !assignedEmailAccountId) continue;
        await conn.execute(
          "INSERT INTO run_profile_tracks (id, run_profile_id, track, state, current_step) VALUES (?, ?, ?, 'pending', 0)",
          [randomUUID(), rpId, track]
        );
      }
    }
  });

  return res.json({
    enrolled: eligible.length,
    skipped_already_enrolled,
    skipped_linkedin_active_elsewhere,
    skipped_unsubscribed,
  });
}
