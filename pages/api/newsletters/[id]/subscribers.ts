import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db";
import { randomUUID } from "crypto";
import { isSuppressed } from "@/lib/email/suppression";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  const newsletter = await dbGet("SELECT id FROM newsletters WHERE id = ?", [id]);
  if (!newsletter) return res.status(404).json({ error: "Newsletter not found" });

  if (req.method === "GET") {
    const subscribers = await dbAll(`
      SELECT * FROM newsletter_subscribers
      WHERE newsletter_id = ?
      ORDER BY subscribed_at DESC
    `, [id]);
    return res.json({ subscribers });
  }

  if (req.method === "POST") {
    const { email, full_name, subscribers, list_id } = req.body as {
      email?: string;
      full_name?: string;
      subscribers?: Array<{ email: string; full_name?: string }>;
      list_id?: string;
    };

    if (list_id) {
      // Import targets with emails from specified DB list
      const targets = await dbAll<{ email: string; full_name: string | null }>(`
        SELECT t.email, t.full_name
        FROM list_targets lt
        JOIN targets t ON t.id = lt.target_id
        WHERE lt.list_id = ? AND t.email IS NOT NULL AND t.email LIKE '%@%'
      `, [list_id]);

      let added = 0;
      let blocked = 0;
      
      await dbTransaction(async (conn: any) => {
        for (const item of targets) {
          if (await isSuppressed(item.email)) { blocked++; continue; }
          const [result] = await conn.execute(`
            INSERT IGNORE INTO newsletter_subscribers (id, newsletter_id, email, full_name)
            VALUES (?, ?, ?, ?)
          `, [randomUUID(), id, item.email.trim().toLowerCase(), item.full_name?.trim() ?? null]);
          if (result.affectedRows > 0) added++;
        }
      });
      
      return res.status(201).json({ added, blocked, total: targets.length });
    }

    if (Array.isArray(subscribers) && subscribers.length > 0) {
      // Bulk import
      let added = 0;
      let blocked = 0;
      
      await dbTransaction(async (conn: any) => {
        for (const item of subscribers) {
          if (!item.email || !item.email.includes("@")) continue;
          if (await isSuppressed(item.email)) { blocked++; continue; }
          const [result] = await conn.execute(`
            INSERT IGNORE INTO newsletter_subscribers (id, newsletter_id, email, full_name)
            VALUES (?, ?, ?, ?)
          `, [randomUUID(), id, item.email.trim().toLowerCase(), item.full_name?.trim() ?? null]);
          if (result.affectedRows > 0) added++;
        }
      });
      
      return res.status(201).json({ added, blocked, total: subscribers.length });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    if (await isSuppressed(email)) {
      return res.status(400).json({ error: "This email has unsubscribed/is suppressed and can't be re-added." });
    }

    const subId = randomUUID();
    try {
      await dbRun(`
        INSERT INTO newsletter_subscribers (id, newsletter_id, email, full_name)
        VALUES (?, ?, ?, ?)
      `, [subId, id, email.trim().toLowerCase(), full_name?.trim() ?? null]);
    } catch {
      return res.status(400).json({ error: "Subscriber email already exists for this newsletter" });
    }

    const created = await dbGet("SELECT * FROM newsletter_subscribers WHERE id = ?", [subId]);
    return res.status(201).json({ subscriber: created });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
