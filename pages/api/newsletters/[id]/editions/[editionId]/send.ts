import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { sendEmail } from "@/lib/email/sender";
import { decryptSecret } from "@/lib/crypto";
import { unsubscribeUrl, isSuppressed } from "@/lib/email/suppression";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const { id: newsletterId, editionId } = req.query as { id: string; editionId: string };

  // 1. Fetch Newsletter & Edition
  const newsletter = await dbGet<{
    id: string;
    name: string;
    sender_name: string | null;
    sender_email: string;
  }>("SELECT * FROM newsletters WHERE id = ?", [newsletterId]);

  if (!newsletter) return res.status(404).json({ error: "Newsletter not found" });

  const edition = await dbGet<{
    id: string;
    title: string;
    subject: string;
    content_html: string;
    status: string;
  }>("SELECT * FROM newsletter_editions WHERE id = ? AND newsletter_id = ?", [editionId, newsletterId]);

  if (!edition) return res.status(404).json({ error: "Edition issue not found" });

  // 2. Fetch connected email account settings for sender_email
  const emailAccount = await dbGet<{
    id: string;
    from_email: string;
    from_name: string | null;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: number;
    username: string;
    password: string;
  }>(`
    SELECT * FROM email_accounts WHERE from_email = ? LIMIT 1
  `, [newsletter.sender_email]);

  if (!emailAccount) {
    return res.status(400).json({
      error: `Connected email account for '${newsletter.sender_email}' not found. Configure it in Settings → Email.`,
    });
  }

  // 3. Fetch all active subscribers. Never trust newsletter_subscribers.status alone — the
  // global suppression list (lib/email/suppression.ts) is the single source of truth for "must
  // never be emailed again" across every channel, so double-check it here too (belt-and-braces,
  // same pattern the cold-email/LinkedIn runner uses). Anyone found suppressed gets their local
  // status synced to 'unsubscribed' and is skipped rather than sent to.
  const candidateSubscribers = await dbAll<{ id: string; email: string; full_name: string | null }>(`
    SELECT * FROM newsletter_subscribers
    WHERE newsletter_id = ? AND status = 'subscribed'
  `, [newsletterId]);

  const subscribers: typeof candidateSubscribers = [];
  let suppressedCount = 0;
  for (const sub of candidateSubscribers) {
    if (await isSuppressed(sub.email)) {
      await dbRun(
        "UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, NOW()) WHERE id = ?",
        [sub.id]
      );
      suppressedCount++;
      continue;
    }
    subscribers.push(sub);
  }

  if (subscribers.length === 0) {
    return res.status(400).json({
      error: suppressedCount > 0
        ? `All ${suppressedCount} subscriber(s) on this newsletter are unsubscribed/suppressed — nothing to send.`
        : "No active subscribers found for this newsletter",
    });
  }

  // Update edition status to sending
  await dbRun("UPDATE newsletter_editions SET status = 'sending' WHERE id = ?", [editionId]);

  const password = decryptSecret(emailAccount.password) ?? emailAccount.password;
  let sentCount = 0;
  let failedCount = 0;

  // 4. Batch send emails via nodemailer SMTP
  for (const sub of subscribers) {
    try {
      const unsubLink = unsubscribeUrl(sub.id);
      const htmlBody = edition.content_html
        ? edition.content_html.replace(/\{\{unsubscribe_url\}\}/g, unsubLink)
        : undefined;

      await sendEmail(
        {
          id: emailAccount.id,
          smtp_host: emailAccount.smtp_host,
          smtp_port: emailAccount.smtp_port,
          smtp_secure: emailAccount.smtp_secure,
          username: emailAccount.username,
          password,
          from_email: emailAccount.from_email,
          from_name: newsletter.sender_name ?? emailAccount.from_name ?? newsletter.name,
        },
        sub.email,
        edition.subject,
        // Plain-text fallback part for clients that don't render HTML — sendEmail() requires
        // a `body` (text) argument; `html` is the separate, optional rich part.
        `${edition.title}\n\nUnsubscribe: ${unsubLink}`,
        htmlBody,
        {
          "List-Unsubscribe": `<${unsubLink}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      );

      // Record send log
      await dbRun(`
        REPLACE INTO newsletter_sends (id, edition_id, subscriber_id, status, sent_at)
        VALUES (?, ?, ?, 'sent', NOW())
      `, [`${editionId}_${sub.id}`, editionId, sub.id]);

      sentCount++;
    } catch (err) {
      console.error(`[newsletter send] Failed to send to ${sub.email}:`, err);
      await dbRun(`
        REPLACE INTO newsletter_sends (id, edition_id, subscriber_id, status)
        VALUES (?, ?, ?, 'failed')
      `, [`${editionId}_${sub.id}`, editionId, sub.id]);

      failedCount++;
    }
  }

  // Mark edition as sent
  await dbRun("UPDATE newsletter_editions SET status = 'sent', sent_at = NOW() WHERE id = ?", [editionId]);

  return res.json({
    message: "Newsletter edition dispatched successfully",
    sent_count: sentCount,
    failed_count: failedCount,
    suppressed_count: suppressedCount,
    total_subscribers: subscribers.length,
  });
}
