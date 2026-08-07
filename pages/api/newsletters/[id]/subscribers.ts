/**
 * API route for newsletter subscribers: GET (list) and POST (add/import)
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const { id } = req.query as { id: string };

  const newsletter = db.prepare("SELECT id FROM newsletters WHERE id = ?").get(id);
  if (!newsletter) return res.status(404).json({ error: "Newsletter not found" });

  if (req.method === "GET") {
    const subscribers = db.prepare(`
      SELECT * FROM newsletter_subscribers
      WHERE newsletter_id = ?
      ORDER BY subscribed_at DESC
    `).all(id);
    return res.json({ subscribers });
  }

  if (req.method === "POST") {
    const { email, full_name, subscribers } = req.body as {
      email?: string;
      full_name?: string;
      subscribers?: Array<{ email: string; full_name?: string }>;
    };

    if (Array.isArray(subscribers) && subscribers.length > 0) {
      // Bulk import
      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO newsletter_subscribers (id, newsletter_id, email, full_name)
        VALUES (?, ?, ?, ?)
      `);

      let added = 0;
      const transaction = db.transaction((items: Array<{ email: string; full_name?: string }>) => {
        for (const item of items) {
          if (!item.email || !item.email.includes("@")) continue;
          const res = insertStmt.run(randomUUID(), id, item.email.trim().toLowerCase(), item.full_name?.trim() ?? null);
          if (res.changes > 0) added++;
        }
      });

      transaction(subscribers);
      return res.status(201).json({ added, total: subscribers.length });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const subId = randomUUID();
    try {
      db.prepare(`
        INSERT INTO newsletter_subscribers (id, newsletter_id, email, full_name)
        VALUES (?, ?, ?, ?)
      `).run(subId, id, email.trim().toLowerCase(), full_name?.trim() ?? null);
    } catch {
      return res.status(400).json({ error: "Subscriber email already exists for this newsletter" });
    }

    const created = db.prepare("SELECT * FROM newsletter_subscribers WHERE id = ?").get(subId);
    return res.status(201).json({ subscriber: created });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
