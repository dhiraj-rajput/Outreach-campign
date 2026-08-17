import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

const VALID_TYPES = new Set(["call", "email", "meeting", "note", "other"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const targetId = typeof req.query.target_id === "string" ? req.query.target_id : undefined;
    if (!targetId) return res.status(400).json({ error: "target_id is required." });
    const rows = await dbAll(
      `SELECT id, target_id, type, body, logged_at, created_at FROM activity_logs
       WHERE target_id = ? ORDER BY logged_at DESC, created_at DESC`, [targetId]
    );
    return res.status(200).json({ logs: rows });
  }

  if (req.method === "POST") {
    const { target_id, type, body, logged_at } = req.body as {
      target_id?: string; type?: string; body?: string; logged_at?: string;
    };
    if (!target_id) return res.status(400).json({ error: "target_id is required." });
    const logType = (type ?? "note").toLowerCase();
    if (!VALID_TYPES.has(logType)) {
      return res.status(400).json({ error: "type must be call, email, meeting, note, or other." });
    }
    const text = (body ?? "").trim();
    if (!text) return res.status(400).json({ error: "body is required." });
    if (text.length > 8000) return res.status(400).json({ error: "body is too long." });

    const target = await dbGet("SELECT id FROM targets WHERE id = ?", [target_id]);
    if (!target) return res.status(404).json({ error: "Contact not found." });

    const id = randomUUID();
    const when = logged_at && !Number.isNaN(Date.parse(logged_at)) ? logged_at : null;
    if (when) {
      await dbRun(`INSERT INTO activity_logs (id, target_id, type, body, logged_at) VALUES (?, ?, ?, ?, ?)`,
        [id, target_id, logType, text, when]);
    } else {
      await dbRun(`INSERT INTO activity_logs (id, target_id, type, body) VALUES (?, ?, ?, ?)`,
        [id, target_id, logType, text]);
    }
    return res.status(201).json(
      await dbGet(`SELECT id, target_id, type, body, logged_at, created_at FROM activity_logs WHERE id = ?`, [id])
    );
  }

  if (req.method === "DELETE") {
    const id = typeof req.query.id === "string" ? req.query.id : undefined;
    if (!id) return res.status(400).json({ error: "id is required." });
    const existing = await dbGet("SELECT id FROM activity_logs WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ error: "Activity log not found." });
    await dbRun("DELETE FROM activity_logs WHERE id = ?", [id]);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const id = typeof req.query.id === "string" ? req.query.id : undefined;
    if (!id) return res.status(400).json({ error: "id is required." });
    const existing = await dbGet<{ id: string; target_id: string; type: string; body: string; logged_at: string; created_at: string }>(
      `SELECT id, target_id, type, body, logged_at, created_at FROM activity_logs WHERE id = ?`, [id]
    );
    if (!existing) return res.status(404).json({ error: "Activity log not found." });

    const { type, body, logged_at } = req.body as { type?: string; body?: string; logged_at?: string };
    let logType = existing.type;
    let text = existing.body;
    let when = existing.logged_at;
    if (type !== undefined) {
      const t = type.toLowerCase();
      if (!VALID_TYPES.has(t)) return res.status(400).json({ error: "Invalid type." });
      logType = t;
    }
    if (body !== undefined) {
      const b = body.trim();
      if (!b) return res.status(400).json({ error: "body cannot be empty." });
      text = b.slice(0, 8000);
    }
    if (logged_at !== undefined && logged_at && !Number.isNaN(Date.parse(logged_at))) when = logged_at;

    await dbRun(`UPDATE activity_logs SET type = ?, body = ?, logged_at = ? WHERE id = ?`,
      [logType, text, when, id]);
    return res.status(200).json(
      await dbGet(`SELECT id, target_id, type, body, logged_at, created_at FROM activity_logs WHERE id = ?`, [id])
    );
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).end();
}
