/**
 * GET /api/email/history
 * PLACE AT: pages/api/email/history.ts
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { listSuppressions } from "@/lib/email/suppression";

function fillDays(
  rows: {
    day: string; campaign_sent: number; campaign_opens: number; campaign_clicks: number;
    campaign_replies: number; newsletter_sent: number; newsletter_opens: number; newsletter_clicks: number;
  }[],
  days: number
) {
  const filled: typeof rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = rows.find((r) => r.day === key);
    filled.push(found ?? {
      day: key, campaign_sent: 0, campaign_opens: 0, campaign_clicks: 0, campaign_replies: 0,
      newsletter_sent: 0, newsletter_opens: 0, newsletter_clicks: 0,
    });
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
        (SELECT COUNT(*) FROM logs WHERE message LIKE 'Email sent%') AS campaign_emails_sent,
        (SELECT COUNT(*) FROM targets WHERE email_opened_at IS NOT NULL) AS campaign_opens,
        (SELECT COUNT(*) FROM targets WHERE email_clicked_at IS NOT NULL) AS campaign_clicks,
        (SELECT COUNT(*) FROM targets WHERE email_replied_at IS NOT NULL) AS campaign_replies,
        (SELECT COUNT(*) FROM newsletter_sends WHERE status = 'sent') AS newsletter_emails_sent,
        (SELECT COUNT(*) FROM newsletter_sends WHERE opened_at IS NOT NULL) AS newsletter_opens,
        (SELECT COUNT(*) FROM newsletter_sends WHERE clicked_at IS NOT NULL) AS newsletter_clicks,
        (SELECT COUNT(*) FROM suppressions) AS unsubscribed_count
    `).get() as Record<string, number>;

    const rates = {
      campaign_open_rate: totals.campaign_emails_sent > 0 ? Math.round((totals.campaign_opens / totals.campaign_emails_sent) * 1000) / 10 : 0,
      campaign_click_rate: totals.campaign_emails_sent > 0 ? Math.round((totals.campaign_clicks / totals.campaign_emails_sent) * 1000) / 10 : 0,
      campaign_reply_rate: totals.campaign_emails_sent > 0 ? Math.round((totals.campaign_replies / totals.campaign_emails_sent) * 1000) / 10 : 0,
      newsletter_open_rate: totals.newsletter_emails_sent > 0 ? Math.round((totals.newsletter_opens / totals.newsletter_emails_sent) * 1000) / 10 : 0,
      newsletter_click_rate: totals.newsletter_emails_sent > 0 ? Math.round((totals.newsletter_clicks / totals.newsletter_emails_sent) * 1000) / 10 : 0,
      overall_open_rate: totals.campaign_emails_sent + totals.newsletter_emails_sent > 0
        ? Math.round(((totals.campaign_opens + totals.newsletter_opens) / (totals.campaign_emails_sent + totals.newsletter_emails_sent)) * 1000) / 10 : 0,
    };

    const campaigns = db.prepare(`
      SELECT w.id AS workflow_id, w.name AS workflow_name, COUNT(DISTINCT r.id) AS run_count,
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
      GROUP BY w.id HAVING emails_sent > 0
      ORDER BY last_activity_at DESC LIMIT 25
    `).all();

    const newsletterEditions = db.prepare(`
      SELECT ne.id, ne.title, ne.subject, ne.status, ne.sent_at, ne.created_at, n.name AS newsletter_name,
        COUNT(ns.id) AS total_recipients,
        COUNT(CASE WHEN ns.status = 'sent' THEN 1 END) AS sent_count,
        COUNT(CASE WHEN ns.status = 'failed' THEN 1 END) AS failed_count,
        COUNT(CASE WHEN ns.opened_at IS NOT NULL THEN 1 END) AS opened_count,
        COUNT(CASE WHEN ns.clicked_at IS NOT NULL THEN 1 END) AS clicked_count
      FROM newsletter_editions ne
      JOIN newsletters n ON n.id = ne.newsletter_id
      LEFT JOIN newsletter_sends ns ON ns.edition_id = ne.id
      WHERE ne.status IN ('sent', 'sending')
      GROUP BY ne.id ORDER BY ne.sent_at DESC LIMIT 25
    `).all();

    const campaignDaily = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS campaign_sent FROM logs
      WHERE message LIKE 'Email sent%' AND created_at >= datetime('now', '-${days} days')
      GROUP BY date(created_at)
    `).all() as { day: string; campaign_sent: number }[];

    const opensDaily = db.prepare(`
      SELECT date(email_opened_at) AS day, COUNT(*) AS campaign_opens FROM targets
      WHERE email_opened_at IS NOT NULL AND email_opened_at >= datetime('now', '-${days} days')
      GROUP BY date(email_opened_at)
    `).all() as { day: string; campaign_opens: number }[];

    const clicksDaily = db.prepare(`
      SELECT date(email_clicked_at) AS day, COUNT(*) AS campaign_clicks FROM targets
      WHERE email_clicked_at IS NOT NULL AND email_clicked_at >= datetime('now', '-${days} days')
      GROUP BY date(email_clicked_at)
    `).all() as { day: string; campaign_clicks: number }[];

    const repliesDaily = db.prepare(`
      SELECT date(email_replied_at) AS day, COUNT(*) AS campaign_replies FROM targets
      WHERE email_replied_at IS NOT NULL AND email_replied_at >= datetime('now', '-${days} days')
      GROUP BY date(email_replied_at)
    `).all() as { day: string; campaign_replies: number }[];

    const nlSentDaily = db.prepare(`
      SELECT date(sent_at) AS day, COUNT(*) AS newsletter_sent FROM newsletter_sends
      WHERE status = 'sent' AND sent_at >= datetime('now', '-${days} days') GROUP BY date(sent_at)
    `).all() as { day: string; newsletter_sent: number }[];

    const nlOpensDaily = db.prepare(`
      SELECT date(opened_at) AS day, COUNT(*) AS newsletter_opens FROM newsletter_sends
      WHERE opened_at IS NOT NULL AND opened_at >= datetime('now', '-${days} days') GROUP BY date(opened_at)
    `).all() as { day: string; newsletter_opens: number }[];

    const nlClicksDaily = db.prepare(`
      SELECT date(clicked_at) AS day, COUNT(*) AS newsletter_clicks FROM newsletter_sends
      WHERE clicked_at IS NOT NULL AND clicked_at >= datetime('now', '-${days} days') GROUP BY date(clicked_at)
    `).all() as { day: string; newsletter_clicks: number }[];

    const map = (arr: { day: string; [k: string]: unknown }[], key: string) =>
      Object.fromEntries(arr.map((r) => [r.day, r[key] as number]));

    const cSent = map(campaignDaily, "campaign_sent");
    const cOpens = map(opensDaily, "campaign_opens");
    const cClicks = map(clicksDaily, "campaign_clicks");
    const cReplies = map(repliesDaily, "campaign_replies");
    const nSent = map(nlSentDaily, "newsletter_sent");
    const nOpens = map(nlOpensDaily, "newsletter_opens");
    const nClicks = map(nlClicksDaily, "newsletter_clicks");

    const dailyRaw = Array.from(new Set([
      ...Object.keys(cSent), ...Object.keys(cOpens), ...Object.keys(cClicks), ...Object.keys(cReplies),
      ...Object.keys(nSent), ...Object.keys(nOpens), ...Object.keys(nClicks),
    ])).map((day) => ({
      day,
      campaign_sent: cSent[day] ?? 0, campaign_opens: cOpens[day] ?? 0,
      campaign_clicks: cClicks[day] ?? 0, campaign_replies: cReplies[day] ?? 0,
      newsletter_sent: nSent[day] ?? 0, newsletter_opens: nOpens[day] ?? 0, newsletter_clicks: nClicks[day] ?? 0,
    }));

    const daily = fillDays(dailyRaw, days);

    const funnel = {
      sent: totals.campaign_emails_sent + totals.newsletter_emails_sent,
      opened: totals.campaign_opens + totals.newsletter_opens,
      clicked: totals.campaign_clicks + totals.newsletter_clicks,
      replied: totals.campaign_replies,
      unsubscribed: totals.unsubscribed_count,
    };

    const campaignBars = (campaigns as Array<Record<string, unknown>>).map((c) => {
      const sent = Number(c.emails_sent) || 0;
      return {
        name: String(c.workflow_name).slice(0, 24), workflow_id: c.workflow_id,
        sent, opened: Number(c.opened) || 0, clicked: Number(c.clicked) || 0, replied: Number(c.replied) || 0,
        open_rate: sent > 0 ? Math.round((Number(c.opened) / sent) * 1000) / 10 : 0,
        reply_rate: sent > 0 ? Math.round((Number(c.replied) / sent) * 1000) / 10 : 0,
      };
    });

    const campaignActivity = db.prepare(`
      SELECT l.id, l.message, l.created_at, t.id AS target_id, t.full_name, t.company,
             w.name AS workflow_name, 'campaign' AS source
      FROM logs l
      LEFT JOIN targets t ON t.id = l.target_id
      LEFT JOIN runs r ON r.id = l.run_id
      LEFT JOIN workflows w ON w.id = r.workflow_id
      WHERE l.message LIKE 'Email sent%' ORDER BY l.created_at DESC LIMIT 30
    `).all();

    const newsletterActivity = db.prepare(`
      SELECT ns.id, ns.sent_at AS created_at, ns.status, sub.email, sub.full_name,
             ne.title AS edition_title, n.name AS newsletter_name, 'newsletter' AS source
      FROM newsletter_sends ns
      JOIN newsletter_subscribers sub ON sub.id = ns.subscriber_id
      JOIN newsletter_editions ne ON ne.id = ns.edition_id
      JOIN newsletters n ON n.id = ne.newsletter_id
      ORDER BY ns.sent_at DESC LIMIT 30
    `).all();

    const byHour = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS count FROM logs
      WHERE message LIKE 'Email sent%' GROUP BY hour ORDER BY hour
    `).all() as { hour: number; count: number }[];

    const hourSeries = Array.from({ length: 24 }, (_, h) => ({
      hour: h, label: `${String(h).padStart(2, "0")}:00`,
      count: byHour.find((r) => r.hour === h)?.count ?? 0,
    }));

    return res.json({
      totals, rates, funnel, campaigns, campaignBars, newsletterEditions,
      daily, hourSeries, campaignActivity, newsletterActivity,
      unsubscribed: listSuppressions(), days,
    });
  } catch (err) {
    console.error("[email/history]", err);
    return res.status(500).json({ error: "Failed to load email history" });
  }
}
