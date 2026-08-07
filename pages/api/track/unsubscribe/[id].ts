import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { verifyUnsubscribeToken, addSuppression } from "@/lib/email/suppression";

// Public route — excluded from the session-auth gate in proxy.ts (this link is clicked by
// the recipient, who has no linki session). Signature-verified instead (see suppression.ts).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.id;
  const targetId = Array.isArray(raw) ? raw[0] : raw ?? "";
  const token = (req.query.t as string) || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!targetId || !verifyUnsubscribeToken(targetId, token)) {
    return res.status(400).send(page("Invalid link", "This unsubscribe link is invalid or has expired."));
  }

  try {
    const db = getDb();
    const target = db.prepare("SELECT id, email FROM targets WHERE id = ?").get(targetId) as
      { id: string; email: string | null } | undefined;

    if (target?.email) {
      db.prepare("UPDATE targets SET unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')) WHERE id = ?").run(target.id);
      addSuppression(target.email, "unsubscribed", target.id);
    }
  } catch (err) {
    // Never let a DB error surface to the recipient — always show the confirmation page.
    console.error("[unsubscribe] processing error:", err);
  }

  return res.status(200).send(page("You've been unsubscribed", "You won't receive further emails from this sender."));
}

function page(title: string, message: string): string {
  return `<html>
  <body style="font-family: Arial, sans-serif; max-width: 480px; margin: 60px auto; text-align: center;">
    <h2>${title}</h2>
    <p style="color:#6b7280;">${message}</p>
  </body>
</html>`;
}
