/**
 * GET /api/linkedin/history
 *
 * Powers the LinkedIn history page: per-campaign stats, activity feed, time-series,
 * funnel metrics, and opted-out contacts.
 *
 * PLACE AT: pages/api/linkedin/history.ts
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet } from "@/lib/db";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);

    const totalsRow = await dbGet<Record<string, number>>(`
      SELECT
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Connection request sent%') AS connections_sent,
        (SELECT COUNT(*) FROM targets WHERE connected_at IS NOT NULL) AS connections_accepted,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Message sent%') AS messages_sent,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'InMail sent%') AS inmails_sent,
        (SELECT COUNT(*) FROM targets WHERE last_replied_at IS NOT NULL) AS replies_received,
        (SELECT COUNT(*) FROM targets WHERE li_intent = 'not_interested') AS opted_out,
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Visited%') AS visits,
        (SELECT COUNT(*) FROM targets WHERE connection_requested_at IS NOT NULL) AS unique_connects_requested
    `);
    const totals = totalsRow || { connections_sent: 0, connections_accepted: 0, messages_sent: 0, inmails_sent: 0, replies_received: 0, opted_out: 0, visits: 0, unique_connects_requested: 0 };

    const rates = {
      acceptance_rate: totals.connections_sent > 0
        ? Math.round((totals.connections_accepted / totals.connections_sent) * 1000) / 10 : 0,
      reply_rate: totals.messages_sent + totals.inmails_sent > 0
        ? Math.round((totals.replies_received / (totals.messages_sent + totals.inmails_sent)) * 1000) / 10 : 0,
      connect_to_message_rate: totals.connections_accepted > 0
        ? Math.round(((totals.messages_sent + totals.inmails_sent) / totals.connections_accepted) * 1000) / 10 : 0,
    };

    const campaigns = await dbAll<Record<string, unknown>>(`
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
    `);

    const activityDaily = await dbAll<{ day: string; visits: number; connections: number; messages: number; inmails: number; accepts: number }>(`
      SELECT
        DATE(created_at) AS day,
        COUNT(CASE WHEN message LIKE 'Visited%' THEN 1 END) AS visits,
        COUNT(CASE WHEN message LIKE 'Connection request sent%' THEN 1 END) AS connections,
        COUNT(CASE WHEN message LIKE 'Message sent%' THEN 1 END) AS messages,
        COUNT(CASE WHEN message LIKE 'InMail sent%' THEN 1 END) AS inmails,
        0 AS accepts
      FROM logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
        AND (message LIKE 'Visited%' OR message LIKE 'Connection request sent%'
             OR message LIKE 'Message sent%' OR message LIKE 'InMail sent%')
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const acceptsByDay = await dbAll<{ day: string; accepts: number }>(`
      SELECT DATE(connected_at) AS day, COUNT(*) AS accepts
      FROM targets
      WHERE connected_at IS NOT NULL AND connected_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY DATE(connected_at)
    `);

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

    const byHour = await dbAll<{ hour: number; count: number }>(`
      SELECT CAST(DATE_FORMAT(created_at, '%H') AS UNSIGNED) AS hour, COUNT(*) AS count
      FROM logs
      WHERE message LIKE 'Connection request sent%' OR message LIKE 'Message sent%' OR message LIKE 'InMail sent%'
      GROUP BY hour ORDER BY hour
    `);

    const hourSeries = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      count: byHour.find((r) => r.hour === h)?.count ?? 0,
    }));

    const activity = await dbAll(`
      SELECT l.id, l.message, l.level, l.created_at,
             t.id AS target_id, t.full_name, t.company, w.name AS workflow_name
      FROM logs l
      LEFT JOIN targets t ON t.id = l.target_id
      LEFT JOIN runs r ON r.id = l.run_id
      LEFT JOIN workflows w ON w.id = r.workflow_id
      WHERE l.message LIKE 'Visited%' OR l.message LIKE 'Connection request sent%'
         OR l.message LIKE 'Message sent%' OR l.message LIKE 'InMail sent%'
      ORDER BY l.created_at DESC LIMIT 50
    `);

    const optedOut = await dbAll(`
      SELECT id, full_name, company, email, li_intent, li_intent_at
      FROM targets WHERE li_intent = 'not_interested'
      ORDER BY li_intent_at DESC LIMIT 200
    `);

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

    const intentRows = await dbAll<{ intent: string; count: number }>(`
      SELECT li_intent AS intent, COUNT(*) AS count
      FROM targets WHERE li_intent IS NOT NULL AND li_intent != ''
      GROUP BY li_intent ORDER BY count DESC
    `);

    const pipelineRow = await dbGet<Record<string, number>>(`
      SELECT
        SUM(CASE WHEN connection_requested_at IS NULL AND message_sent_at IS NULL THEN 1 ELSE 0 END) AS not_contacted,
        SUM(CASE WHEN connection_requested_at IS NOT NULL AND (degree IS NULL OR degree != 1) AND message_sent_at IS NULL THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN degree = 1 AND message_sent_at IS NULL THEN 1 ELSE 0 END) AS connected_unmessaged,
        SUM(CASE WHEN message_sent_at IS NOT NULL AND last_replied_at IS NULL THEN 1 ELSE 0 END) AS messaged_no_reply,
        SUM(CASE WHEN last_replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN inmail_sent_at IS NOT NULL THEN 1 ELSE 0 END) AS inmailed
      FROM targets
      WHERE id IN (SELECT DISTINCT target_id FROM list_targets)
    `);
    const pipeline = pipelineRow || { not_contacted: 0, pending: 0, connected_unmessaged: 0, messaged_no_reply: 0, replied: 0, inmailed: 0 };

    const topCompanies = await dbAll<{ company: string; accepted: number }>(`
      SELECT COALESCE(company, 'Unknown') AS company, COUNT(*) AS accepted
      FROM targets
      WHERE connected_at IS NOT NULL AND company IS NOT NULL AND company != ''
      GROUP BY company ORDER BY accepted DESC LIMIT 10
    `);

    return res.json({
      totals, rates, funnel, campaigns, campaignBars, daily, hourSeries, activity, optedOut, days,
      intentBreakdown: intentRows, pipeline, topCompanies,
    });
  } catch (err) {
    console.error("[linkedin/history]", err);
    return res.status(500).json({ error: "Failed to load LinkedIn history" });
  }
}
