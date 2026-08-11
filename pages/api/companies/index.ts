import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();

  if (req.method === "GET") {
    const full = req.query.full === "1" || req.query.full === "true";
    const search = (req.query.search as string | undefined)?.trim();
    const explicitPaging = req.query.limit !== undefined || req.query.page !== undefined;
    const hasPaging = explicitPaging || !full;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = (Number(req.query.page) || 0) * limit;
    const parentOnly = req.query.parents === "1";

    const whereParts: string[] = [];
    const whereArgs: unknown[] = [];
    if (search) {
      whereParts.push("c.name LIKE ?");
      whereArgs.push(`%${search}%`);
    }
    if (parentOnly) {
      whereParts.push("c.parent_company_id IS NULL");
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

    const select = full
      ? "c.*"
      : "c.id, c.name, c.domain, c.industry, c.location, c.website, c.employee_count, c.parent_company_id, c.created_at";

    const total = (
      db.prepare(`SELECT COUNT(*) as c FROM companies c ${where}`).get(...whereArgs) as {
        c: number;
      }
    ).c;

    const pageClause = hasPaging ? " LIMIT ? OFFSET ?" : "";
    const pageArgs = hasPaging ? [limit, offset] : [];

    const companies = db
      .prepare(
        `
      SELECT ${select},
             COUNT(DISTINCT t.id) as contact_count,
             COUNT(DISTINCT p.id) as project_count,
             parent.name as parent_name
      FROM companies c
      LEFT JOIN targets t ON t.company_id = c.id
      LEFT JOIN projects p ON p.company_id = c.id
      LEFT JOIN companies parent ON parent.id = c.parent_company_id
      ${where}
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE${pageClause}
    `
      )
      .all(...whereArgs, ...pageArgs);

    return res.json({ companies, total });
  }

  if (req.method === "POST") {
    const {
      name,
      domain,
      industry,
      location,
      linkedin_url,
      website,
      notes,
      parent_company_id,
      projects,
    } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name required" });

    if (parent_company_id) {
      const parent = db.prepare("SELECT id FROM companies WHERE id = ?").get(parent_company_id);
      if (!parent) return res.status(400).json({ error: "parent company not found" });
    }

    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO companies (id, name, domain, industry, location, linkedin_url, website, notes, parent_company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      name,
      domain ?? null,
      industry ?? null,
      location ?? null,
      linkedin_url ?? null,
      website ?? null,
      notes ?? null,
      parent_company_id ?? null
    );

    // projects: array of { name, description?, url? } or plain strings
    if (Array.isArray(projects)) {
      const insertP = db.prepare(
        `INSERT INTO projects (id, company_id, name, description, url, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', datetime('now'))`
      );
      for (const p of projects) {
        if (typeof p === "string" && p.trim()) {
          insertP.run(randomUUID(), id, p.trim(), null, null);
        } else if (p && typeof p === "object" && typeof p.name === "string" && p.name.trim()) {
          insertP.run(
            randomUUID(),
            id,
            p.name.trim(),
            p.description ?? null,
            p.url ?? null
          );
        }
      }
    }

    return res.status(201).json(db.prepare("SELECT * FROM companies WHERE id = ?").get(id));
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
