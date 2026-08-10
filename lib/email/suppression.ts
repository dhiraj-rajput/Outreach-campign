import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";

// Ported from PPT-Agent's Suppression model + app/core/tracking_helpers.py
// (unsubscribe_url / verify_unsubscribe_token). Uses NEXTAUTH_SECRET the same way
// lib/crypto.ts derives its encryption key, so no new env var is needed.

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET must be set to sign/verify unsubscribe links");
  return s;
}

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

function signToken(targetId: string): string {
  return createHmac("sha256", secret()).update(targetId).digest("hex").slice(0, 24);
}

/** Build a signed, unguessable unsubscribe URL for a target. */
export function unsubscribeUrl(targetId: string): string {
  return `${baseUrl()}/api/track/unsubscribe/${targetId}?t=${signToken(targetId)}`;
}

/** Verify the `t` query param on an unsubscribe link. Constant-time comparison. */
export function verifyUnsubscribeToken(targetId: string, token: string): boolean {
  const expected = signToken(targetId);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token || "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Is this email address on the suppression list? Checked before every send. */
export function isSuppressed(email: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM suppressions WHERE email = ? COLLATE NOCASE").get(email);
  return !!row;
}

/**
 * Add an email to the suppression list (idempotent — email is UNIQUE).
 *
 * Suppression is global and cross-channel: once an email is here, it must never be sent to
 * again from *any* surface — cold email campaigns, LinkedIn-track email steps, or newsletters —
 * regardless of which surface the person unsubscribed from. So this also syncs the two other
 * places an email address is "subscribed" somewhere:
 *  - targets.unsubscribed_at (read by enrollment.ts + the linkedin/email runner before every send)
 *  - newsletter_subscribers.status (read by the newsletter send endpoint)
 * This is what keeps "unsubscribed once" from meaning "unsubscribed from just this one thing".
 */
export function addSuppression(email: string, reason: string, targetId?: string | null): void {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM suppressions WHERE email = ? COLLATE NOCASE").get(email);
  if (!exists) {
    db.prepare(
      "INSERT INTO suppressions (id, email, reason, target_id) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), email, reason, targetId ?? null);
  }

  // Cross-sync: mark every target with this email as unsubscribed (blocks future cold-email
  // enrollment/sends even for target rows other than the one that triggered this).
  db.prepare(
    "UPDATE targets SET unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')) WHERE email = ? COLLATE NOCASE"
  ).run(email);

  // Cross-sync: mark every newsletter subscription for this email as unsubscribed (blocks
  // future newsletter sends across every newsletter, not just the one they clicked from).
  db.prepare(
    "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')) WHERE email = ? COLLATE NOCASE AND status != 'unsubscribed'"
  ).run(email);
}

/** Remove an email from the suppression list (re-subscribe / undo an accidental unsubscribe). */
export function removeSuppression(email: string): void {
  const db = getDb();
  db.prepare("DELETE FROM suppressions WHERE email = ? COLLATE NOCASE").run(email);
}

interface SuppressionRow {
  id: string;
  email: string;
  reason: string;
  target_id: string | null;
  created_at: string;
}

/** All suppressed (unsubscribed/bounced) people, newest first — for the Email/LinkedIn history pages. */
export function listSuppressions(): Array<SuppressionRow & {
  full_name: string | null;
  company: string | null;
}> {
  const db = getDb();
  return db.prepare(`
    SELECT s.id, s.email, s.reason, s.target_id, s.created_at,
           t.full_name, t.company
    FROM suppressions s
    LEFT JOIN targets t ON t.id = s.target_id
    ORDER BY s.created_at DESC
  `).all() as Array<SuppressionRow & { full_name: string | null; company: string | null }>;
}

/** Plain-text footer appended to non-HTML campaign emails. */
export function unsubscribeFooterText(targetId: string): string {
  return `\n\n---\nDon't want these emails? Unsubscribe: ${unsubscribeUrl(targetId)}`;
}

/** HTML footer block appended to beautified/HTML campaign emails. */
export function unsubscribeFooterHtml(targetId: string): string {
  const url = unsubscribeUrl(targetId);
  return `<tr><td style="background:#f8f8f8;padding:20px 40px;color:#999999;font-size:12px;font-family:Arial,sans-serif;">You received this email because you opted in. <a href="${url}" style="color:#1a237e;">Unsubscribe</a></td></tr>`;
}

/**
 * RFC 8058 one-click unsubscribe headers. Gmail/Outlook/Yahoo show their own native
 * "Unsubscribe" chip right next to the sender name when these are present (instead of the
 * recipient having to scroll to the footer link) — required by Google/Yahoo's 2024 bulk
 * sender rules for anything sending marketing/campaign volume. The mail client POSTs to
 * `unsubscribeUrl` with no user interaction, so that route must handle POST with zero
 * confirmation friction (see pages/api/track/unsubscribe/[id].ts).
 */
export function unsubscribeHeaders(targetId: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(targetId)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
