import { getDb } from "@/lib/db";

// Ported from PPT-Agent's backend/app/core/email_worker.py (SCORE_RULES / classify_score /
// add_score). Purely additive metadata on `targets` — never gates or changes send behavior,
// same as the PPT-Agent original (see 02-migration-plan.md, Part A.3).
export const SCORE_RULES = {
  emailSent: 5,
  emailOpened: 10,
  linkClicked: 20,
  replied: 50,
  meetingBooked: 100,
} as const;

export type LeadGrade = "cold" | "warm" | "hot" | "sql";

/** Classify a numeric score into cold/warm/hot/sql — thresholds match PPT-Agent's classify_score(). */
export function classifyScore(score: number): LeadGrade {
  if (score > 100) return "sql";
  if (score >= 61) return "hot";
  if (score >= 31) return "warm";
  return "cold";
}

/** Add `delta` to a target's score and recompute its grade. Best-effort — never throws. */
export function addScore(targetId: string, delta: number): void {
  try {
    const db = getDb();
    const row = db.prepare("SELECT score FROM targets WHERE id = ?").get(targetId) as { score: number } | undefined;
    if (!row) return;
    const newScore = (row.score ?? 0) + delta;
    const newGrade = classifyScore(newScore);
    db.prepare("UPDATE targets SET score = ?, grade = ? WHERE id = ?").run(newScore, newGrade, targetId);
  } catch (err) {
    console.error("[lead-score] failed to update score for", targetId, err);
  }
}

export function scoreEmailSent(targetId: string): void {
  addScore(targetId, SCORE_RULES.emailSent);
}

export function scoreEmailOpened(targetId: string): void {
  addScore(targetId, SCORE_RULES.emailOpened);
}

export function scoreLinkClicked(targetId: string): void {
  addScore(targetId, SCORE_RULES.linkClicked);
}

export function scoreReplied(targetId: string): void {
  addScore(targetId, SCORE_RULES.replied);
}

export function scoreMeetingBooked(targetId: string): void {
  addScore(targetId, SCORE_RULES.meetingBooked);
}
