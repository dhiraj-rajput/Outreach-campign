import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { dbGet, dbAll, dbRun } from "@/lib/db";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export type TodoRow = {
  id: string;
  target_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "open" | "done";
  created_at: string;
  full_name?: string | null;
  email?: string | null;
  company?: string | null;
  linkedin_url?: string | null;
  title_role?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const targetId = typeof req.query.target_id === "string" ? req.query.target_id : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (status === "open" || status === "done") {
      clauses.push("td.status = ?");
      params.push(status);
    }
    if (targetId) {
      clauses.push("td.target_id = ?");
      params.push(targetId);
    }
    if (q) {
      clauses.push(
        "(td.title LIKE ? OR td.description LIKE ? OR t.full_name LIKE ? OR t.email LIKE ? OR t.company LIKE ?)"
      );
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = await dbAll<TodoRow>(
        `SELECT td.id, td.target_id, td.title, td.description, td.due_date, td.status, td.created_at,
                t.full_name, t.email, t.company, t.linkedin_url, t.title AS title_role
         FROM todos td
         LEFT JOIN targets t ON t.id = td.target_id
         ${where}
         ORDER BY
           CASE WHEN td.status = 'open' THEN 0 ELSE 1 END,
           CASE WHEN td.due_date IS NULL THEN 1 ELSE 0 END,
           td.due_date ASC,
           td.created_at DESC`,
           params
      );

    const summary = await dbGet(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count,
          SUM(CASE WHEN status = 'open' AND due_date IS NOT NULL AND DATE(due_date) < CURDATE() THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN status = 'open' AND due_date IS NOT NULL AND DATE(due_date) = CURDATE() THEN 1 ELSE 0 END) AS due_today,
          SUM(CASE WHEN status = 'open' AND due_date IS NOT NULL AND DATE(due_date) > CURDATE() AND DATE(due_date) <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS due_week
         FROM todos`
      );

    return res.status(200).json({ todos: rows, summary });
  }

  if (req.method === "POST") {
    const { target_id, title, description, due_date } = req.body as {
      target_id?: string; title?: string; description?: string | null; due_date?: string | null;
    };
    if (!target_id || typeof target_id !== "string") {
      return res.status(400).json({ error: "target_id is required." });
    }
    const trimmedTitle = (title ?? "").trim();
    if (!trimmedTitle) return res.status(400).json({ error: "Title is required." });
    if (trimmedTitle.length > 200) return res.status(400).json({ error: "Title must be at most 200 characters." });

    const target = await dbGet("SELECT id FROM targets WHERE id = ?", [target_id]);
    if (!target) return res.status(404).json({ error: "Contact not found." });

    let due: string | null = null;
    if (due_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
        return res.status(400).json({ error: "due_date must be YYYY-MM-DD." });
      }
      due = due_date;
    }

    const id = randomUUID();
    const desc = description?.trim() ? description.trim().slice(0, 4000) : null;
    await dbRun(
      `INSERT INTO todos (id, target_id, title, description, due_date, status) VALUES (?, ?, ?, ?, ?, 'open')`,
      [id, target_id, trimmedTitle, desc, due]
    );

    const row = await dbGet(
      `SELECT id, target_id, title, description, due_date, status, created_at FROM todos WHERE id = ?`,
      [id]
    );
    return res.status(201).json(row);
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
