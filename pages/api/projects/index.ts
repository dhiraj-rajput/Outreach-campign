import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const companyId = req.query.company_id as string | undefined;
    if (companyId) {
      const projects = await dbAll(
          `SELECT * FROM projects WHERE company_id = ? ORDER BY name`,
          [companyId]
        );
      return res.json({ projects });
    }
    const projects = await dbAll(`SELECT * FROM projects ORDER BY created_at DESC LIMIT 200`);
    return res.json({ projects });
  }

  if (req.method === "POST") {
    const { company_id, name, description, url, status } = req.body ?? {};
    if (!company_id || !name) {
      return res.status(400).json({ error: "company_id and name required" });
    }
    const company = await dbGet("SELECT id FROM companies WHERE id = ?", [company_id]);
    if (!company) return res.status(404).json({ error: "company not found" });

    const id = randomUUID();
    await dbRun(
      `INSERT INTO projects (id, company_id, name, description, url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
       [
         id,
         company_id,
         name,
         description ?? null,
         url ?? null,
         status ?? "active"
       ]
    );

    return res.status(201).json(await dbGet("SELECT * FROM projects WHERE id = ?", [id]));
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end();
}
