import type { getDb } from "@/lib/db";

type DB = ReturnType<typeof getDb>;

/**
 * Per-channel enrollment rules:
 *  - LinkedIn: a contact can only be actively enrolled on the LinkedIn track of ONE
 *    workflow at a time (their LinkedIn account / connection graph is a single shared
 *    resource). Enrolling them into a second LinkedIn campaign is blocked while the
 *    first is still running/paused and not yet completed/failed/skipped on that track.
 *  - Email (cold outreach): a contact CAN be enrolled in multiple concurrent email
 *    campaigns — there's no shared per-contact resource being contended for — unless
 *    they've unsubscribed (targets.unsubscribed_at), in which case they're excluded
 *    from the email track everywhere (the runner also double-checks suppression at
 *    send time, so this is belt-and-braces, not the only guard).
 *  - Newsletters are an entirely separate system (newsletter_subscribers, keyed per
 *    newsletter) and are not affected by any of this — a contact can be subscribed
 *    to any number of newsletters independently.
 */
export interface EnrollmentEligibility {
  /** Targets already enrolled anywhere in THIS workflow — never re-add, regardless of track. */
  alreadyInWorkflow: Set<string>;
  /** Targets currently active on the LinkedIn track of some OTHER workflow. */
  linkedinBlockedElsewhere: Set<string>;
  /** Targets that have unsubscribed from cold email. */
  emailUnsubscribed: Set<string>;
}

export function resolveEnrollmentEligibility(
  db: DB,
  workflowId: string,
  workflowTracks: string[],
  candidateTargetIds: string[]
): EnrollmentEligibility {
  const alreadyInWorkflow = new Set(
    (db.prepare(
      `SELECT DISTINCT rp.target_id FROM run_profiles rp
       JOIN runs r ON r.id = rp.run_id
       WHERE r.workflow_id = ?`
    ).all(workflowId) as { target_id: string }[]).map((r) => r.target_id)
  );

  let linkedinBlockedElsewhere = new Set<string>();
  if (workflowTracks.includes("linkedin")) {
    linkedinBlockedElsewhere = new Set(
      (db.prepare(
        `SELECT DISTINCT rp.target_id FROM run_profiles rp
         JOIN runs r ON r.id = rp.run_id
         JOIN run_profile_tracks rt ON rt.run_profile_id = rp.id
         WHERE r.workflow_id != ?
           AND r.status IN ('running', 'paused')
           AND rt.track = 'linkedin'
           AND rt.state NOT IN ('completed', 'failed', 'skipped')`
      ).all(workflowId) as { target_id: string }[]).map((r) => r.target_id)
    );
  }

  let emailUnsubscribed = new Set<string>();
  if (workflowTracks.includes("email") && candidateTargetIds.length > 0) {
    const placeholders = candidateTargetIds.map(() => "?").join(",");
    emailUnsubscribed = new Set(
      (db.prepare(
        `SELECT id FROM targets WHERE id IN (${placeholders}) AND unsubscribed_at IS NOT NULL`
      ).all(...candidateTargetIds) as { id: string }[]).map((r) => r.id)
    );
  }

  return { alreadyInWorkflow, linkedinBlockedElsewhere, emailUnsubscribed };
}

/**
 * Given a target and the workflow's full track list, returns the subset of tracks
 * that target can actually be enrolled into (may be empty, e.g. an email-only
 * workflow where the target has unsubscribed).
 */
export function tracksFor(
  targetId: string,
  workflowTracks: string[],
  elig: EnrollmentEligibility
): string[] {
  return workflowTracks.filter((track) => {
    if (track === "linkedin" && elig.linkedinBlockedElsewhere.has(targetId)) return false;
    if (track === "email" && elig.emailUnsubscribed.has(targetId)) return false;
    return true;
  });
}
