import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const company = await dbGet<Record<string, unknown>>("SELECT * FROM companies WHERE id = ?", [id]);
    if (!company) return res.status(404).json({ error: "not found" });

    const contacts = await dbAll(
        "SELECT id, full_name, title, email, linkedin_url FROM targets WHERE company_id = ? ORDER BY full_name",
        [id]
      );

    const projects = await dbAll(
        `SELECT * FROM projects WHERE company_id = ? ORDER BY name`,
        [id]
      );

    const children = await dbAll(
        `SELECT id, name, domain, industry FROM companies WHERE parent_company_id = ? ORDER BY name`,
        [id]
      );

    let parent = null;
    if (company.parent_company_id) {
      parent = await dbGet(`SELECT id, name, domain FROM companies WHERE id = ?`, [company.parent_company_id as string]);
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
      const parent = await dbGet("SELECT id FROM companies WHERE id = ?", [parent_company_id]);
      if (!parent) return res.status(400).json({ error: "parent company not found" });
      // Shallow cycle check: parent should not already list this as parent
      const parentRow = await dbGet<{ parent_company_id: string | null }>("SELECT parent_company_id FROM companies WHERE id = ?", [parent_company_id]);
      if (parentRow?.parent_company_id === id) {
        return res.status(400).json({ error: "circular parent/child relationship" });
      }
    }

    await dbRun(
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
    `, [
      name ?? null,
      domain ?? null,
      industry ?? null,
      location ?? null,
      linkedin_url ?? null,
      website ?? null,
      notes ?? null,
      parent_company_id ?? null,
      id
    ]);
    return res.json(await dbGet("SELECT * FROM companies WHERE id = ?", [id]));
  }

  if (req.method === "DELETE") {
    // Re-parent children to null, unlink contacts, cascade projects via FK
    await dbRun("UPDATE companies SET parent_company_id = NULL WHERE parent_company_id = ?", [id]);
    await dbRun("UPDATE targets SET company_id = NULL WHERE company_id = ?", [id]);
    await dbRun("DELETE FROM projects WHERE company_id = ?", [id]);
    await dbRun("DELETE FROM companies WHERE id = ?", [id]);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
