import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();

  if (req.method === "GET") {
    const companyId = req.query.company_id as string | undefined;
    if (companyId) {
      const projects = db
        .prepare(
          `SELECT * FROM projects WHERE company_id = ? ORDER BY name COLLATE NOCASE`
        )
        .all(companyId);
      return res.json({ projects });
    }
    const projects = db
      .prepare(`SELECT * FROM projects ORDER BY created_at DESC LIMIT 200`)
      .all();
    return res.json({ projects });
  }

  if (req.method === "POST") {
    const { company_id, name, description, url, status } = req.body ?? {};
    if (!company_id || !name) {
      return res.status(400).json({ error: "company_id and name required" });
    }
    const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(company_id);
    if (!company) return res.status(404).json({ error: "company not found" });

    const id = randomUUID();
    db.prepare(
      `INSERT INTO projects (id, company_id, name, description, url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      id,
      company_id,
      name,
      description ?? null,
      url ?? null,
      status ?? "active"
    );

    return res.status(201).json(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
