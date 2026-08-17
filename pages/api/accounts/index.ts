import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Excludes cookies_json — the frontend never uses the raw session blob, only
  // is_authenticated, so there's no reason to ship it (even encrypted) to the client.
  const ACCOUNT_COLUMNS = `a.id, a.name, a.email, a.is_authenticated, a.daily_connection_limit, a.daily_message_limit, a.daily_inmail_limit,
    a.active_hours_start, a.active_hours_end, a.timezone, a.working_days, a.created_at,
    a.inbox_synced_at, a.accepted_sync_at, a.li_connections, a.li_pending, a.li_profile_views,
    a.li_stats_synced_at, a.connections_synced_through_ms`;

  if (req.method === "GET") {
    const accounts = await dbAll(`
      SELECT ${ACCOUNT_COLUMNS},
        (SELECT COUNT(*) FROM runs r WHERE r.account_id = a.id AND r.status IN ('running', 'paused')) AS active_run_count
      FROM accounts a ORDER BY a.created_at DESC
    `);
    return res.json(accounts);
  }

  if (req.method === "POST") {
    const { name, email, daily_connection_limit = 20, daily_message_limit = 50, daily_inmail_limit = 15 } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email required" });
    try {
      const id = randomUUID();
      await dbRun(
          "INSERT INTO accounts (id, name, email, daily_connection_limit, daily_message_limit, daily_inmail_limit) VALUES (?, ?, ?, ?, ?, ?)",
          [id, name, email, daily_connection_limit, daily_message_limit, daily_inmail_limit]
        );
      const account = await dbGet(`SELECT ${ACCOUNT_COLUMNS} FROM accounts a WHERE a.id = ?`, [id]);
      return res.status(201).json(account);
    } catch {
      return res.status(409).json({ error: "Email already exists" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
