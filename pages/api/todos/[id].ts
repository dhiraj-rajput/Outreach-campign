import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { dbGet, dbRun } from "@/lib/db";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const id = req.query.id;
  if (typeof id !== "string" || !id) return res.status(400).json({ error: "Invalid todo id." });

  const existing = await dbGet<{
    id: string; target_id: string; title: string; description: string | null;
    due_date: string | null; status: "open" | "done"; created_at: string;
  }>(
    "SELECT id, target_id, title, description, due_date, status, created_at FROM todos WHERE id = ?",
    [id]
  );

  if (!existing) return res.status(404).json({ error: "Todo not found." });

  if (req.method === "GET") return res.status(200).json(existing);

  if (req.method === "PATCH") {
    const body = req.body as {
      title?: string; description?: string | null; due_date?: string | null; status?: "open" | "done";
    };
    let title = existing.title;
    let description = existing.description;
    let due_date = existing.due_date;
    let status = existing.status;

    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) return res.status(400).json({ error: "Title cannot be empty." });
      if (t.length > 200) return res.status(400).json({ error: "Title must be at most 200 characters." });
      title = t;
    }
    if (body.description !== undefined) {
      description = body.description?.trim() ? body.description.trim().slice(0, 4000) : null;
    }
    if (body.due_date !== undefined) {
      if (body.due_date === null || body.due_date === "") due_date = null;
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
        return res.status(400).json({ error: "due_date must be YYYY-MM-DD." });
      } else due_date = body.due_date;
    }
    if (body.status !== undefined) {
      if (body.status !== "open" && body.status !== "done") {
        return res.status(400).json({ error: "status must be open or done." });
      }
      status = body.status;
    }

    await dbRun(`UPDATE todos SET title = ?, description = ?, due_date = ?, status = ? WHERE id = ?`,
      [title, description, due_date, status, id]);

    return res.status(200).json(
      await dbGet(`SELECT id, target_id, title, description, due_date, status, created_at FROM todos WHERE id = ?`, [id])
    );
  }

  if (req.method === "DELETE") {
    await dbRun("DELETE FROM todos WHERE id = ?", [id]);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  return res.status(405).end();
}
