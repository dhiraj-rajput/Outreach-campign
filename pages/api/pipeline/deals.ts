/**
 * GET  /api/pipeline/deals   → list all deals (kanban board data), grouped by nothing —
 *                              client groups by `stage`.
 * POST /api/pipeline/deals   → create a deal
 * Body (POST): { title, target_id?, company_id?, value?, currency?, notes? }
 *
 * Paid feature: gated by requirePaidAccess.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { requirePaidAccess } from "@/lib/access";

export type DealRow = {
  id: string;
  title: string;
  target_id: string | null;
  company_id: string | null;
  value: number;
  currency: string;
  stage: string;
  notes: string | null;
  owner_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  contact_name: string | null;
  company_name: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const access = await requirePaidAccess(req, res);
  if (!access) return;

  const db = getDb();

  if (req.method === "GET") {
    const deals = db
      .prepare(
        `SELECT d.*, t.full_name as contact_name, c.name as company_name
         FROM pipeline_deals d
         LEFT JOIN targets t ON t.id = d.target_id
         LEFT JOIN companies c ON c.id = d.company_id
         ORDER BY d.stage, d.position ASC, d.created_at DESC`
      )
      .all() as DealRow[];
    return res.status(200).json({ deals });
  }

  if (req.method === "POST") {
    const { title, target_id, company_id, value, currency, notes } = req.body as {
      title?: string;
      target_id?: string;
      company_id?: string;
      value?: number;
      currency?: string;
      notes?: string;
    };
    if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });

    const id = randomUUID();
    db.prepare(
      `INSERT INTO pipeline_deals (id, title, target_id, company_id, value, currency, notes, owner_id, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title.trim(),
      target_id || null,
      company_id || null,
      typeof value === "number" ? value : 0,
      currency || "USD",
      notes || null,
      access.userId,
      access.orgId
    );

    const deal = db
      .prepare(
        `SELECT d.*, t.full_name as contact_name, c.name as company_name
         FROM pipeline_deals d
         LEFT JOIN targets t ON t.id = d.target_id
         LEFT JOIN companies c ON c.id = d.company_id
         WHERE d.id = ?`
      )
      .get(id);
    return res.status(201).json({ deal });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
