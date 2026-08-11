import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/lib/db";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = getDb();
  const id = req.query.id as string;

  if (req.method === "GET") {
    const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!company) return res.status(404).json({ error: "not found" });

    const contacts = db
      .prepare(
        "SELECT id, full_name, title, email, linkedin_url FROM targets WHERE company_id = ? ORDER BY full_name"
      )
      .all(id);

    const projects = db
      .prepare(
        `SELECT * FROM projects WHERE company_id = ? ORDER BY name COLLATE NOCASE`
      )
      .all(id);

    const children = db
      .prepare(
        `SELECT id, name, domain, industry FROM companies WHERE parent_company_id = ? ORDER BY name COLLATE NOCASE`
      )
      .all(id);

    let parent = null;
    if (company.parent_company_id) {
      parent = db
        .prepare(`SELECT id, name, domain FROM companies WHERE id = ?`)
        .get(company.parent_company_id as string);
    }

    return res.json({ ...company, contacts, projects, children, parent });
  }

  if (req.method === "PUT") {
    const {
      name,
      domain,
      industry,
      location,
      linkedin_url,
      website,
      notes,
      parent_company_id,
    } = req.body ?? {};

    // Prevent cycles: cannot set self as parent
    if (parent_company_id && parent_company_id === id) {
      return res.status(400).json({ error: "company cannot be its own parent" });
    }
    if (parent_company_id) {
      const parent = db.prepare("SELECT id FROM companies WHERE id = ?").get(parent_company_id);
      if (!parent) return res.status(400).json({ error: "parent company not found" });
      // Shallow cycle check: parent should not already list this as parent
      const parentRow = db
        .prepare("SELECT parent_company_id FROM companies WHERE id = ?")
        .get(parent_company_id) as { parent_company_id: string | null } | undefined;
      if (parentRow?.parent_company_id === id) {
        return res.status(400).json({ error: "circular parent/child relationship" });
      }
    }

    db.prepare(
      `
      UPDATE companies SET
        name = COALESCE(?, name),
        domain = ?,
        industry = ?,
        location = ?,
        linkedin_url = ?,
        website = ?,
        notes = ?,
        parent_company_id = ?
      WHERE id = ?
    `
    ).run(
      name ?? null,
      domain ?? null,
      industry ?? null,
      location ?? null,
      linkedin_url ?? null,
      website ?? null,
      notes ?? null,
      parent_company_id ?? null,
      id
    );
    return res.json(db.prepare("SELECT * FROM companies WHERE id = ?").get(id));
  }

  if (req.method === "DELETE") {
    // Re-parent children to null, unlink contacts, cascade projects via FK
    db.prepare("UPDATE companies SET parent_company_id = NULL WHERE parent_company_id = ?").run(id);
    db.prepare("UPDATE targets SET company_id = NULL WHERE company_id = ?").run(id);
    db.prepare("DELETE FROM projects WHERE company_id = ?").run(id);
    db.prepare("DELETE FROM companies WHERE id = ?").run(id);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
