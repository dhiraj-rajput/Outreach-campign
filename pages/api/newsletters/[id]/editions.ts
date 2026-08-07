/**
 * API route for newsletter editions: GET (list) and POST (create)
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const { id } = req.query as { id: string };

  const newsletter = db.prepare("SELECT * FROM newsletters WHERE id = ?").get(id);
  if (!newsletter) return res.status(404).json({ error: "Newsletter not found" });

  if (req.method === "GET") {
    const editions = db.prepare(`
      SELECT 
        e.*,
        (SELECT COUNT(*) FROM newsletter_sends ns WHERE ns.edition_id = e.id) AS total_sends,
        (SELECT COUNT(*) FROM newsletter_sends ns WHERE ns.edition_id = e.id AND ns.status = 'sent') AS sent_count,
        (SELECT COUNT(*) FROM newsletter_sends ns WHERE ns.edition_id = e.id AND ns.opened_at IS NOT NULL) AS opened_count
      FROM newsletter_editions e
      WHERE e.newsletter_id = ?
      ORDER BY e.created_at DESC
    `).all(id);
    return res.json({ editions });
  }

  if (req.method === "POST") {
    const { title, subject, content_html } = req.body as {
      title?: string;
      subject?: string;
      content_html?: string;
    };

    if (!title || !subject || !content_html) {
      return res.status(400).json({ error: "title, subject, and content_html are required" });
    }

    const editionId = randomUUID();
    db.prepare(`
      INSERT INTO newsletter_editions (id, newsletter_id, title, subject, content_html, status)
      VALUES (?, ?, ?, ?, ?, 'draft')
    `).run(editionId, id, title.trim(), subject.trim(), content_html);

    const created = db.prepare("SELECT * FROM newsletter_editions WHERE id = ?").get(editionId);
    return res.status(201).json({ edition: created });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
