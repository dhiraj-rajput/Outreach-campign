/**
 * GET /api/linkedin/history
 *
 * Powers the LinkedIn history page: per-campaign stats, activity feed, time-series,
 * funnel metrics, and opted-out contacts.
 *
 * PLACE AT: pages/api/linkedin/history.ts
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";

function fillDays(
  rows: { day: string; visits: number; connections: number; messages: number; inmails: number; accepts: number }[],
  days: number
) {
  const filled: typeof rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = rows.find((r) => r.day === key);
    filled.push(found ?? { day: key, visits: 0, connections: 0, messages: 0, inmails: 0, accepts: 0 });
  }
  return filled;
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const db = getDb();
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);

    const totals = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Connection request sent%') AS connections_sent,
        (SELECT COUNT(*) FROM targets WHERE connected_at IS NOT NULL) AS connections_accepted,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Message sent%') AS messages_sent,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'InMail sent%') AS inmails_sent,
        (SELECT COUNT(*) FROM targets WHERE last_replied_at IS NOT NULL) AS replies_received,
        (SELECT COUNT(*) FROM targets WHERE li_intent = 'not_interested') AS opted_out,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Visited%') AS visits,
        (SELECT COUNT(*) FROM targets WHERE connection_requested_at IS NOT NULL) AS unique_connects_requested
    `).get() as Record<string, number>;

    const rates = {
      acceptance_rate: totals.connections_sent > 0
        ? Math.round((totals.connections_accepted / totals.connections_sent) * 1000) / 10 : 0,
      reply_rate: totals.messages_sent + totals.inmails_sent > 0
        ? Math.round((totals.replies_received / (totals.messages_sent + totals.inmails_sent)) * 1000) / 10 : 0,
      connect_to_message_rate: totals.connections_accepted > 0
        ? Math.round(((totals.messages_sent + totals.inmails_sent) / totals.connections_accepted) * 1000) / 10 : 0,
    };

    const campaigns = db.prepare(`
      SELECT
        w.id AS workflow_id, w.name AS workflow_name, w.is_archived,
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

    const activityDaily = db.prepare(`
      SELECT
        date(created_at) AS day,
        COUNT(CASE WHEN message LIKE 'Visited%' THEN 1 END) AS visits,
        COUNT(CASE WHEN message LIKE 'Connection request sent%' THEN 1 END) AS connections,
        COUNT(CASE WHEN message LIKE 'Message sent%' THEN 1 END) AS messages,
        COUNT(CASE WHEN message LIKE 'InMail sent%' THEN 1 END) AS inmails,
        0 AS accepts
      FROM logs
      WHERE created_at >= datetime('now', '-${days} days')
        AND (message LIKE 'Visited%' OR message LIKE 'Connection request sent%'
             OR message LIKE 'Message sent%' OR message LIKE 'InMail sent%')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).all() as { day: string; visits: number; connections: number; messages: number; inmails: number; accepts: number }[];

    const acceptsByDay = db.prepare(`
      SELECT date(connected_at) AS day, COUNT(*) AS accepts
      FROM targets
      WHERE connected_at IS NOT NULL AND connected_at >= datetime('now', '-${days} days')
      GROUP BY date(connected_at)
    `).all() as { day: string; accepts: number }[];

    const acceptMap = Object.fromEntries(acceptsByDay.map((r) => [r.day, r.accepts]));
    const daily = fillDays(
      activityDaily.map((r) => ({ ...r, accepts: acceptMap[r.day] ?? 0 })),
      days
    );
    for (const row of daily) {
      if (acceptMap[row.day] && !row.accepts) row.accepts = acceptMap[row.day];
    }

    const funnel = {
      visits: totals.visits,
      connections_sent: totals.connections_sent,
      connections_accepted: totals.connections_accepted,
      messages_sent: totals.messages_sent + totals.inmails_sent,
      replies: totals.replies_received,
    };

    const byHour = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS count
      FROM logs
      WHERE message LIKE 'Connection request sent%' OR message LIKE 'Message sent%' OR message LIKE 'InMail sent%'
      GROUP BY hour ORDER BY hour
    `).all() as { hour: number; count: number }[];

    const hourSeries = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      count: byHour.find((r) => r.hour === h)?.count ?? 0,
    }));

    const activity = db.prepare(`
      SELECT l.id, l.message, l.level, l.created_at,
             t.id AS target_id, t.full_name, t.company, w.name AS workflow_name
      FROM logs l
      LEFT JOIN targets t ON t.id = l.target_id
      LEFT JOIN runs r ON r.id = l.run_id
      LEFT JOIN workflows w ON w.id = r.workflow_id
      WHERE l.message LIKE 'Visited%' OR l.message LIKE 'Connection request sent%'
         OR l.message LIKE 'Message sent%' OR l.message LIKE 'InMail sent%'
      ORDER BY l.created_at DESC LIMIT 50
    `).all();

    const optedOut = db.prepare(`
      SELECT id, full_name, company, email, li_intent, li_intent_at
      FROM targets WHERE li_intent = 'not_interested'
      ORDER BY li_intent_at DESC LIMIT 200
    `).all();

    const campaignBars = campaigns.map((c) => ({
      name: String(c.workflow_name).slice(0, 24),
      workflow_id: c.workflow_id,
      sent: Number(c.connections_sent) || 0,
      accepted: Number(c.connections_accepted) || 0,
      messages: (Number(c.messages_sent) || 0) + (Number(c.inmails_sent) || 0),
      replies: Number(c.replies) || 0,
      accept_rate: Number(c.connections_sent) > 0
        ? Math.round((Number(c.connections_accepted) / Number(c.connections_sent)) * 1000) / 10 : 0,
    }));

    return res.json({
      totals, rates, funnel, campaigns, campaignBars, daily, hourSeries, activity, optedOut, days,
    });
  } catch (err) {
    console.error("[linkedin/history]", err);
    return res.status(500).json({ error: "Failed to load LinkedIn history" });
  }
}
