import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const accounts = (await dbAll(`
    SELECT id, name, from_email, daily_email_limit, ramp_up_enabled, ramp_start_date
    FROM email_accounts
    ORDER BY name
  `)) as {
    id: string; name: string; from_email: string;
    daily_email_limit: number; ramp_up_enabled: number; ramp_start_date: string | null;
  }[];

  // Sent per account per day for the last 7 days
  const dailySends = (await dbAll(`
    SELECT rp.email_account_id,
           DATE(l.created_at) as day,
           COUNT(*) as sent
    FROM logs l
    JOIN run_profiles rp ON rp.run_id = l.run_id AND rp.target_id = l.target_id
    WHERE l.message LIKE 'Email sent%'
    AND l.created_at >= DATE_SUB(NOW(), INTERVAL 6 DAY)
    GROUP BY rp.email_account_id, DATE(l.created_at)
  `)) as { email_account_id: string; day: string; sent: number }[];

  // Last 50 email send log entries across all accounts
  const recentLogs = (await dbAll(`
    SELECT l.created_at, l.message, rp.email_account_id
    FROM logs l
    JOIN run_profiles rp ON rp.run_id = l.run_id AND rp.target_id = l.target_id
    WHERE l.message LIKE 'Email sent%'
    ORDER BY l.created_at DESC
    LIMIT 50
  `)) as { created_at: string; message: string; email_account_id: string }[];

  // Guard trips today
  const guardTrips = (await dbAll(`
    SELECT l.created_at, l.message, rp.email_account_id
    FROM logs l
    LEFT JOIN run_profiles rp ON rp.run_id = l.run_id AND rp.target_id = l.target_id
    WHERE (l.message LIKE '%Daily limit%' OR l.message LIKE '%limit guard%')
    AND DATE(l.created_at) = CURDATE()
    ORDER BY l.created_at DESC
    LIMIT 50
  `)) as { created_at: string; message: string; email_account_id: string | null }[];

  function effectiveLimit(a: typeof accounts[0], date: Date) {
    if (!a.ramp_up_enabled || !a.ramp_start_date) return a.daily_email_limit;
    const start = new Date(a.ramp_start_date);
    const daysActive = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.min(a.daily_email_limit, daysActive * 2);
  }

  const now = new Date();
  // Build last 7 days list (UTC dates)
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Index sends: accountId -> day -> count
  const sendsIndex: Record<string, Record<string, number>> = {};
  for (const row of dailySends) {
    if (!sendsIndex[row.email_account_id]) sendsIndex[row.email_account_id] = {};
    sendsIndex[row.email_account_id][row.day] = row.sent;
  }

  const today = now.toISOString().slice(0, 10);

  const result = accounts.map(a => {
    const sentToday = sendsIndex[a.id]?.[today] ?? 0;
    const limit = effectiveLimit(a, now);
    return {
      id: a.id,
      name: a.name,
      from_email: a.from_email,
      daily_email_limit: a.daily_email_limit,
      ramp_up_enabled: a.ramp_up_enabled,
      ramp_start_date: a.ramp_start_date,
      effective_limit_today: limit,
      sent_today: sentToday,
      days: days.map(day => ({
        day,
        sent: sendsIndex[a.id]?.[day] ?? 0,
        limit: effectiveLimit(a, new Date(day + "T12:00:00Z")),
      })),
    };
  });

  res.json({ accounts: result, days, recentLogs, guardTrips });
}
