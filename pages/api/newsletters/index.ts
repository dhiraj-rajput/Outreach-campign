import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const rows = await dbAll(`
      SELECT 
        n.*,
        (SELECT COUNT(*) FROM newsletter_subscribers ns WHERE ns.newsletter_id = n.id AND ns.status = 'subscribed') AS subscriber_count,
        (SELECT COUNT(*) FROM newsletter_editions ne WHERE ne.newsletter_id = n.id) AS edition_count
      FROM newsletters n
      ORDER BY n.created_at DESC
    `);
    return res.json({ newsletters: rows });
  }

  if (req.method === "POST") {
    const { name, description, sender_name, sender_email } = req.body as {
      name?: string;
      description?: string;
      sender_name?: string;
      sender_email?: string;
    };

    if (!name || !sender_email) {
      return res.status(400).json({ error: "name and sender_email are required" });
    }

    const id = randomUUID();
    await dbRun(`
      INSERT INTO newsletters (id, name, description, sender_name, sender_email)
      VALUES (?, ?, ?, ?, ?)
    `, [id, name.trim(), description?.trim() ?? null, sender_name?.trim() ?? null, sender_email.trim()]);

    const created = await dbGet("SELECT * FROM newsletters WHERE id = ?", [id]);
    return res.status(201).json({ newsletter: created });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
