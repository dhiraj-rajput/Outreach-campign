/**
 * POST /api/targets/[id]/unsubscribe
 *
 * Manually unsubscribes a contact from email outreach (the "Unsubscribe" button next to the
 * email field on the contact page). Adds them to the global suppression list, which — via
 * addSuppression()'s cross-sync — also flips their newsletter_subscribers rows to unsubscribed
 * and blocks them from any future cold-email/newsletter enrollment, exactly as if they'd
 * clicked an unsubscribe link themselves.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet } from "@/lib/db";
import { addSuppression } from "@/lib/email/suppression";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const id = req.query.id as string;

  const target = await dbGet<{ id: string; email: string | null }>("SELECT id, email FROM targets WHERE id = ?", [id]);

  if (!target) return res.status(404).json({ error: "Contact not found" });
  if (!target.email) return res.status(400).json({ error: "This contact has no email address to unsubscribe" });

  await addSuppression(target.email, "manual", target.id);

  const updated = await dbGet("SELECT id, email, unsubscribed_at FROM targets WHERE id = ?", [target.id]);
  return res.json({ ok: true, target: updated });
}
