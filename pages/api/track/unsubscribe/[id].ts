import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbRun } from "@/lib/db";
import { verifyUnsubscribeToken, addSuppression } from "@/lib/email/suppression";

// Public route — excluded from the session-auth gate in proxy.ts (this link is clicked by
// the recipient, who has no linki session). Signature-verified instead (see suppression.ts).
//
//   GET  → recipient clicked the footer link in the email body. Show a confirmation page.
//   POST → RFC 8058 one-click unsubscribe. Gmail/Outlook/Yahoo send this automatically when
//          the person taps the native "Unsubscribe" chip next to the sender name (enabled by
//          the List-Unsubscribe-Post header — see unsubscribeHeaders() in suppression.ts).
//          Must complete with no redirect/interstitial and no extra confirmation step.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.id;
  const targetId = Array.isArray(raw) ? raw[0] : raw ?? "";
  const token = (req.query.t as string) || "";
  const oneClick = req.method === "POST";

  if (!targetId || !verifyUnsubscribeToken(targetId, token)) {
    if (oneClick) return res.status(400).end();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send(page("Invalid link", "This unsubscribe link is invalid or has expired."));
  }

  try {
    // The unsubscribe link is signed off the raw id with no indication of which table it came
    // from — it's minted both for cold-email/LinkedIn-track targets (unsubscribeUrl(target.id))
    // and for newsletter recipients (unsubscribeUrl(subscriber.id)). Try both.
    const target = await dbGet<{ id: string; email: string | null }>("SELECT id, email FROM targets WHERE id = ?", [targetId]);

    if (target?.email) {
      await dbRun("UPDATE targets SET unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE id = ?", [target.id]);
      await addSuppression(target.email, "unsubscribed", target.id);
    } else {
      const subscriber = await dbGet<{ id: string; email: string }>("SELECT id, email FROM newsletter_subscribers WHERE id = ?", [targetId]);
      if (subscriber?.email) {
        await dbRun(
          "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE id = ?",
          [subscriber.id]
        );
        // addSuppression cross-syncs this to every other newsletter and to targets.unsubscribed_at
        // for any target sharing the same email, so this person can't be re-added anywhere.
        await addSuppression(subscriber.email, "newsletter_unsubscribed", null);
      }
    }
  } catch (err) {
    // Never let a DB error surface to the recipient — always confirm either way.
    console.error("[unsubscribe] processing error:", err);
  }

  // One-click clients (RFC 8058) just want a bare 2xx — no body, no page to render.
  if (oneClick) return res.status(200).end();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(page("You've been unsubscribed", "You won't receive further emails from this sender."));
}

function page(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — Linki</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;color:#e6e6e6;font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;">
    <tr>
      <td align="center" valign="middle" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#141414;border:1px solid #1f1f1f;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:36px 32px 28px;text-align:center;">
              <div style="width:40px;height:40px;border-radius:10px;background:rgba(35,130,252,0.12);display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 6l8 6 8-6M4 6h16v12H4V6z" stroke="#2382fc" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <h1 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#e6e6e6;">${title}</h1>
              <p style="margin:0;font-size:14px;line-height:1.6;color:#9a9a9a;">${message}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 32px;text-align:center;border-top:1px solid #1f1f1f;background:#111111;">
              <p style="margin:0;font-size:12px;color:#5a5a5a;">Changed your mind? Contact the sender directly to be re-added.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
