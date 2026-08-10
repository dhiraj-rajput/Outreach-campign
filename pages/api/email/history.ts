/**
 * GET /api/email/history
 *
 * Powers the Email history page. Covers both email surfaces in the app:
 *  - Cold-email campaign sends (workflow email-track steps, logged to `logs` + tracked via
 *    `tracking_events`)
 *  - Newsletter editions (`newsletter_editions` / `newsletter_sends`)
 * plus the unified list of unsubscribed/suppressed people (lib/email/suppression.ts) — anyone
 * here is blocked from every future send, campaign or newsletter, by design (see
 * addSuppression's cross-sync).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { listSuppressions } from "@/lib/email/suppression";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const db = getDb();

    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Email sent%') AS campaign_emails_sent,
        (SELECT COUNT(*) FROM targets WHERE email_opened_at IS NOT NULL) AS campaign_opens,
        (SELECT COUNT(*) FROM targets WHERE email_clicked_at IS NOT NULL) AS campaign_clicks,
        (SELECT COUNT(*) FROM targets WHERE email_replied_at IS NOT NULL) AS campaign_replies,
        (SELECT COUNT(*) FROM newsletter_sends WHERE status = 'sent') AS newsletter_emails_sent,
        (SELECT COUNT(*) FROM newsletter_sends WHERE opened_at IS NOT NULL) AS newsletter_opens,
        (SELECT COUNT(*) FROM newsletter_sends WHERE clicked_at IS NOT NULL) AS newsletter_clicks,
        (SELECT COUNT(*) FROM suppressions) AS unsubscribed_count
    `).get() as Record<string, number>;

    // Per-campaign (workflow) email-track breakdown — "did this campaign succeed".
    const campaigns = db.prepare(`
      SELECT
        w.id AS workflow_id,
        w.name AS workflow_name,
        COUNT(DISTINCT r.id) AS run_count,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Email sent%' THEN l.target_id || '|' || l.created_at END) AS emails_sent,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Email sent%' AND t.email_opened_at IS NOT NULL THEN l.target_id END) AS opened,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Email sent%' AND t.email_clicked_at IS NOT NULL THEN l.target_id END) AS clicked,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Email sent%' AND t.email_replied_at IS NOT NULL THEN l.target_id END) AS replied,
        MAX(l.created_at) AS last_activity_at
      FROM workflows w
      JOIN runs r ON r.workflow_id = w.id
      LEFT JOIN logs l ON l.run_id = r.id AND l.message LIKE 'Email sent%'
      LEFT JOIN targets t ON t.id = l.target_id
      WHERE w.id IN (SELECT DISTINCT workflow_id FROM workflow_steps WHERE track = 'email')
      GROUP BY w.id
      HAVING emails_sent > 0
      ORDER BY last_activity_at DESC
      LIMIT 25
    `).all();

    // Newsletter editions with per-edition send/open/click stats.
    const newsletterEditions = db.prepare(`
      SELECT
        ne.id, ne.title, ne.subject, ne.status, ne.sent_at, ne.created_at,
        n.name AS newsletter_name,
        COUNT(ns.id) AS total_recipients,
        COUNT(CASE WHEN ns.status = 'sent' THEN 1 END) AS sent_count,
        COUNT(CASE WHEN ns.status = 'failed' THEN 1 END) AS failed_count,
        COUNT(CASE WHEN ns.opened_at IS NOT NULL THEN 1 END) AS opened_count,
        COUNT(CASE WHEN ns.clicked_at IS NOT NULL THEN 1 END) AS clicked_count
      FROM newsletter_editions ne
      JOIN newsletters n ON n.id = ne.newsletter_id
      LEFT JOIN newsletter_sends ns ON ns.edition_id = ne.id
      WHERE ne.status IN ('sent', 'sending')
      GROUP BY ne.id
      ORDER BY ne.sent_at DESC
      LIMIT 25
    `).all();

    // Recent activity feed — both surfaces interleaved, newest first.
    const campaignActivity = db.prepare(`
      SELECT l.id, l.message, l.created_at, t.id AS target_id, t.full_name, t.company,
             w.name AS workflow_name, 'campaign' AS source
      FROM logs l
      LEFT JOIN targets t ON t.id = l.target_id
      LEFT JOIN runs r ON r.id = l.run_id
      LEFT JOIN workflows w ON w.id = r.workflow_id
      WHERE l.message LIKE 'Email sent%'
      ORDER BY l.created_at DESC
      LIMIT 30
    `).all();

    const newsletterActivity = db.prepare(`
      SELECT ns.id, ns.sent_at AS created_at, ns.status,
             sub.email, sub.full_name,
             ne.title AS edition_title, n.name AS newsletter_name, 'newsletter' AS source
      FROM newsletter_sends ns
      JOIN newsletter_subscribers sub ON sub.id = ns.subscriber_id
      JOIN newsletter_editions ne ON ne.id = ns.edition_id
      JOIN newsletters n ON n.id = ne.newsletter_id
      ORDER BY ns.sent_at DESC
      LIMIT 30
    `).all();

    const unsubscribed = listSuppressions();

    return res.json({
      totals,
      campaigns,
      newsletterEditions,
      campaignActivity,
      newsletterActivity,
      unsubscribed,
    });
  } catch (err) {
    console.error("[email/history]", err);
    return res.status(500).json({ error: "Failed to load email history" });
  }
}
