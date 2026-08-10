/**
 * GET /api/linkedin/history
 *
 * Powers the LinkedIn history page: per-campaign send/success stats, a recent activity feed
 * (connection requests, acceptances, messages, InMails), and the list of contacts who've opted
 * out of LinkedIn outreach (classified "not interested" from a reply, or manually flagged) so
 * they can be excluded from future campaigns.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const db = getDb();

    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Connection request sent%') AS connections_sent,
        (SELECT COUNT(*) FROM targets WHERE connected_at IS NOT NULL) AS connections_accepted,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Message sent%') AS messages_sent,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'InMail sent%') AS inmails_sent,
        (SELECT COUNT(*) FROM targets WHERE last_replied_at IS NOT NULL) AS replies_received,
        (SELECT COUNT(*) FROM targets WHERE li_intent = 'not_interested') AS opted_out
    `).get() as Record<string, number>;

    // Per-campaign (workflow) breakdown — "did this campaign succeed": connect → accept → reply funnel.
    const campaigns = db.prepare(`
      SELECT
        w.id AS workflow_id,
        w.name AS workflow_name,
        w.is_archived,
        COUNT(DISTINCT r.id) AS run_count,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Connection request sent%' THEN l.target_id END) AS connections_sent,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Connection request sent%' AND t.connected_at IS NOT NULL THEN l.target_id END) AS connections_accepted,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'Message sent%' THEN l.target_id END) AS messages_sent,
        COUNT(DISTINCT CASE WHEN l.message LIKE 'InMail sent%' THEN l.target_id END) AS inmails_sent,
        COUNT(DISTINCT CASE WHEN (l.message LIKE 'Message sent%' OR l.message LIKE 'InMail sent%') AND t.last_replied_at IS NOT NULL THEN l.target_id END) AS replies,
        MAX(l.created_at) AS last_activity_at
      FROM workflows w
      JOIN runs r ON r.workflow_id = w.id
      LEFT JOIN logs l ON l.run_id = r.id
      LEFT JOIN targets t ON t.id = l.target_id
      WHERE w.id IN (SELECT DISTINCT workflow_id FROM workflow_steps WHERE track = 'linkedin' OR step_type IN ('visit','connect','message','sales_inmail'))
      GROUP BY w.id
      HAVING connections_sent > 0 OR messages_sent > 0 OR inmails_sent > 0
      ORDER BY last_activity_at DESC
      LIMIT 25
    `).all() as Array<Record<string, unknown>>;

    // Recent activity feed
    const activity = db.prepare(`
      SELECT l.id, l.message, l.level, l.created_at,
             t.id AS target_id, t.full_name, t.company,
             w.name AS workflow_name
      FROM logs l
      LEFT JOIN targets t ON t.id = l.target_id
      LEFT JOIN runs r ON r.id = l.run_id
      LEFT JOIN workflows w ON w.id = r.workflow_id
      WHERE l.message LIKE 'Visited%'
         OR l.message LIKE 'Connection request sent%'
         OR l.message LIKE 'Message sent%'
         OR l.message LIKE 'InMail sent%'
      ORDER BY l.created_at DESC
      LIMIT 50
    `).all();

    // Opted-out / do-not-contact list — LinkedIn has no unsubscribe link, so "not interested"
    // (set when a reply is AI-classified, or can be set manually) is the equivalent signal.
    // Surfaced here so these contacts are visibly excluded from future campaign enrollment.
    const optedOut = db.prepare(`
      SELECT id, full_name, company, email, li_intent, li_intent_at
      FROM targets
      WHERE li_intent = 'not_interested'
      ORDER BY li_intent_at DESC
      LIMIT 200
    `).all();

    return res.json({ totals, campaigns, activity, optedOut });
  } catch (err) {
    console.error("[linkedin/history]", err);
    return res.status(500).json({ error: "Failed to load LinkedIn history" });
  }
}
