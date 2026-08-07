/**
 * POST /api/newsletters/[id]/editions/[editionId]/send
 *
 * Dispatches a newsletter issue edition to all active subscribers of the newsletter.
 * Uses the connected email account (from_email) specified on the newsletter.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email/sender";
import { decryptSecret } from "@/lib/crypto";
import { unsubscribeUrl } from "@/lib/email/suppression";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const { id: newsletterId, editionId } = req.query as { id: string; editionId: string };
  const db = getDb();

  // 1. Fetch Newsletter & Edition
  const newsletter = db.prepare("SELECT * FROM newsletters WHERE id = ?").get(newsletterId) as {
    id: string;
    name: string;
    sender_name: string | null;
    sender_email: string;
  } | undefined;

  if (!newsletter) return res.status(404).json({ error: "Newsletter not found" });

  const edition = db.prepare("SELECT * FROM newsletter_editions WHERE id = ? AND newsletter_id = ?").get(editionId, newsletterId) as {
    id: string;
    title: string;
    subject: string;
    content_html: string;
    status: string;
  } | undefined;

  if (!edition) return res.status(404).json({ error: "Edition issue not found" });

  // 2. Fetch connected email account settings for sender_email
  const emailAccount = db.prepare(`
    SELECT * FROM email_accounts WHERE from_email = ? LIMIT 1
  `).get(newsletter.sender_email) as {
    id: string;
    from_email: string;
    from_name: string | null;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: number;
    username: string;
    password: string;
  } | undefined;

  if (!emailAccount) {
    return res.status(400).json({
      error: `Connected email account for '${newsletter.sender_email}' not found. Configure it in Settings → Email.`,
    });
  }

  // 3. Fetch all active subscribers
  const subscribers = db.prepare(`
    SELECT * FROM newsletter_subscribers
    WHERE newsletter_id = ? AND status = 'subscribed'
  `).all(newsletterId) as Array<{ id: string; email: string; full_name: string | null }>;

  if (subscribers.length === 0) {
    return res.status(400).json({ error: "No active subscribers found for this newsletter" });
  }

  // Update edition status to sending
  db.prepare("UPDATE newsletter_editions SET status = 'sending' WHERE id = ?").run(editionId);

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
      db.prepare(`
        INSERT OR REPLACE INTO newsletter_sends (id, edition_id, subscriber_id, status, sent_at)
        VALUES (?, ?, ?, 'sent', datetime('now'))
      `).run(`${editionId}_${sub.id}`, editionId, sub.id);

      sentCount++;
    } catch (err) {
      console.error(`[newsletter send] Failed to send to ${sub.email}:`, err);
      db.prepare(`
        INSERT OR REPLACE INTO newsletter_sends (id, edition_id, subscriber_id, status)
        VALUES (?, ?, ?, 'failed')
      `).run(`${editionId}_${sub.id}`, editionId, sub.id);

      failedCount++;
    }
  }

  // Mark edition as sent
  db.prepare("UPDATE newsletter_editions SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(editionId);

  return res.json({
    message: "Newsletter edition dispatched successfully",
    sent_count: sentCount,
    failed_count: failedCount,
    total_subscribers: subscribers.length,
  });
}
