import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db";
import { randomUUID } from "crypto";
import { resolveEnrollmentEligibility, tracksFor } from "@/lib/enrollment";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const runs = await dbAll(
      `SELECT r.*,
              MAX(w.name) as workflow_name,
              MAX(l.name) as list_name,
              MAX(a.name) as account_name,
              COUNT(DISTINCT rp.id) as total_profiles,
              COUNT(DISTINCT CASE WHEN NOT EXISTS (
                SELECT 1 FROM run_profile_tracks rt2
                WHERE rt2.run_profile_id = rp.id AND rt2.state NOT IN ('completed', 'failed', 'skipped')
              ) AND EXISTS (
                SELECT 1 FROM run_profile_tracks rt3
                WHERE rt3.run_profile_id = rp.id AND rt3.state = 'completed'
              ) THEN rp.id END) as completed_profiles
       FROM runs r
       LEFT JOIN workflows w ON w.id = r.workflow_id
       LEFT JOIN lists l ON l.id = r.list_id
       LEFT JOIN accounts a ON a.id = r.account_id
       LEFT JOIN run_profiles rp ON rp.run_id = r.id
       GROUP BY r.id
       ORDER BY r.created_at DESC`
    );
    return res.json(runs);
  }

  if (req.method === "POST") {
    const { workflow_id, list_id, account_id, email_account_id, email_account_ids, target_ids } = req.body;
    if (!workflow_id || !list_id)
      return res.status(400).json({ error: "workflow_id, list_id required" });

    // A LinkedIn account is only required when the workflow actually has LinkedIn steps.
    // Email-only workflows should be launchable with just an email account.
    const workflowHasLinkedInStep = !!(await dbGet(
      "SELECT 1 FROM workflow_steps WHERE workflow_id = ? AND track = 'linkedin' LIMIT 1",
      [workflow_id]
    ));
    // Empty string breaks SQLite FKs — treat as null for email-only campaigns
    const linkedInAccountId =
      typeof account_id === "string" && account_id.trim() ? account_id.trim() : null;

    if (workflowHasLinkedInStep && !linkedInAccountId) {
      return res.status(400).json({ error: "account_id required for workflows with LinkedIn steps" });
    }

    // Normalise email account list — prefer the new array, fall back to legacy single-id
    const emailAccountPool: string[] = (
      Array.isArray(email_account_ids) && email_account_ids.length > 0
        ? email_account_ids
        : (email_account_id ? [email_account_id] : [])
    )
      .map((id: string) => String(id).trim())
      .filter(Boolean);

    const workflowHasEmailStep = !!(await dbGet(
      "SELECT 1 FROM workflow_steps WHERE workflow_id = ? AND track = 'email' LIMIT 1",
      [workflow_id]
    ));
    if (workflowHasEmailStep && emailAccountPool.length === 0) {
      return res.status(400).json({ error: "email_account_ids required for workflows with email steps" });
    }

    // Check 1: only one active run per workflow
    const activeRun = await dbGet<{ id: string }>(
      "SELECT id FROM runs WHERE workflow_id = ? AND status IN ('running', 'paused') LIMIT 1",
      [workflow_id]
    );
    if (activeRun) {
      return res.status(400).json({
        error: "workflow_already_active",
        message: "This workflow is already running. Stop or pause it before enrolling a new list.",
      });
    }

    const runId = randomUUID();
    // account_id must be NULL (not "") when there is no LinkedIn account — FK to accounts
    await dbRun("INSERT INTO runs (id, workflow_id, list_id, account_id, email_account_id) VALUES (?, ?, ?, ?, ?)", [runId, workflow_id, list_id, linkedInAccountId, emailAccountPool[0] ?? null]);

    // Create run_profiles — either for selected targets or all targets in the list
    const candidates: { target_id: string }[] = Array.isArray(target_ids) && target_ids.length > 0
      ? (target_ids as string[]).map((id) => ({ target_id: id }))
      : await dbAll<{ target_id: string }>("SELECT target_id FROM list_targets WHERE list_id = ?", [list_id]);

    // Determine which tracks this workflow has steps for
    const workflowTracks = [...new Set(
      (await dbAll<{ track: string }>("SELECT DISTINCT track FROM workflow_steps WHERE workflow_id = ?", [workflow_id])).map(r => r.track)
    )];
    // If no track column exists yet (old DB), default to linkedin-only
    if (workflowTracks.length === 0) workflowTracks.push("linkedin");

    // Per-channel eligibility: LinkedIn contacts can only be active in one LinkedIn
    // campaign at a time; email contacts can be in many, unless they've unsubscribed;
    // newsletters are a separate system entirely and aren't touched here.
    const elig = await resolveEnrollmentEligibility(workflow_id, workflowTracks, candidates.map(c => c.target_id));

    // Drop targets already enrolled anywhere in this workflow; for everyone else, work
    // out which tracks they're actually eligible for (may be a subset of workflowTracks).
    const targetTracks = new Map<string, string[]>();
    for (const c of candidates) {
      if (elig.alreadyInWorkflow.has(c.target_id)) continue;
      const tracks = tracksFor(c.target_id, workflowTracks, elig);
      if (tracks.length > 0) targetTracks.set(c.target_id, tracks);
    }
    const targets = candidates.filter((t) => targetTracks.has(t.target_id));

    if (targets.length === 0) {
      // Clean up the run we just created since there's nothing to enroll
      await dbRun("DELETE FROM runs WHERE id = ?", [runId]);
      return res.status(400).json({
        error: "all_already_enrolled",
        message: "All selected contacts are already enrolled in this workflow, already active in another LinkedIn campaign, or have unsubscribed.",
      });
    }

    // Assign email accounts: company-grouped round-robin
    // All targets at the same company get the same sender; companies cycle through the pool
    const emailAssignment: Map<string, string | null> = new Map();
    if (emailAccountPool.length > 0) {
      // Load company_id for each candidate target
      const targetIds = targets.map(t => t.target_id);
      const placeholders = targetIds.map(() => "?").join(",");
      const companyRows = await dbAll<{ id: string; company_id: string | null }>(
        `SELECT id, company_id FROM targets WHERE id IN (${placeholders})`,
        [...targetIds]
      );

      const companyAccountMap = new Map<string, string>(); // company_id → email_account_id
      let poolCursor = 0;

      for (const row of companyRows) {
        if (row.company_id) {
          if (!companyAccountMap.has(row.company_id)) {
            companyAccountMap.set(row.company_id, emailAccountPool[poolCursor % emailAccountPool.length]);
            poolCursor++;
          }
          emailAssignment.set(row.id, companyAccountMap.get(row.company_id)!);
        } else {
          // No company — assign individually round-robin
          emailAssignment.set(row.id, emailAccountPool[poolCursor % emailAccountPool.length]);
          poolCursor++;
        }
      }
    }

    await dbTransaction(async (conn) => {
      for (const t of targets) {
        const assignedEmailAccountId = emailAssignment.get(t.target_id) ?? null;
        const rpId = randomUUID();
        await conn.execute("INSERT INTO run_profiles (id, run_id, target_id, email_account_id) VALUES (?, ?, ?, ?)", [rpId, runId, t.target_id, assignedEmailAccountId]);
        for (const track of targetTracks.get(t.target_id)!) {
          // Skip email track if no email account is configured on this run
          if (track === "email" && !assignedEmailAccountId) continue;
          await conn.execute("INSERT INTO run_profile_tracks (id, run_profile_id, track, state, current_step) VALUES (?, ?, ?, 'pending', 0)", [randomUUID(), rpId, track]);
        }
      }
    });

    return res.status(201).json({ id: runId });
  }

  res.status(405).end();
}
