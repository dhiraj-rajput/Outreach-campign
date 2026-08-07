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

/** Add an email to the suppression list (idempotent — email is UNIQUE). */
export function addSuppression(email: string, reason: string, targetId?: string | null): void {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM suppressions WHERE email = ? COLLATE NOCASE").get(email);
  if (exists) return;
  db.prepare(
    "INSERT INTO suppressions (id, email, reason, target_id) VALUES (?, ?, ?, ?)"
  ).run(randomUUID(), email, reason, targetId ?? null);
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
