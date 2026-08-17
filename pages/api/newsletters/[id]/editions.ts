import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  const newsletter = await dbGet("SELECT * FROM newsletters WHERE id = ?", [id]);
  if (!newsletter) return res.status(404).json({ error: "Newsletter not found" });

  if (req.method === "GET") {
    const editions = await dbAll(`
      SELECT 
        e.*,
        (SELECT COUNT(*) FROM newsletter_sends ns WHERE ns.edition_id = e.id) AS total_sends,
        (SELECT COUNT(*) FROM newsletter_sends ns WHERE ns.edition_id = e.id AND ns.status = 'sent') AS sent_count,
        (SELECT COUNT(*) FROM newsletter_sends ns WHERE ns.edition_id = e.id AND ns.opened_at IS NOT NULL) AS opened_count
      FROM newsletter_editions e
      WHERE e.newsletter_id = ?
      ORDER BY e.created_at DESC
    `, [id]);
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
    await dbRun(`
      INSERT INTO newsletter_editions (id, newsletter_id, title, subject, content_html, status)
      VALUES (?, ?, ?, ?, ?, 'draft')
    `, [editionId, id, title.trim(), subject.trim(), content_html]);

    const created = await dbGet("SELECT * FROM newsletter_editions WHERE id = ?", [editionId]);
    return res.status(201).json({ edition: created });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
