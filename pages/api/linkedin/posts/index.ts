/**
 * GET  /api/linkedin/posts — list posts (optional ?status=&account_id=)
 * POST /api/linkedin/posts — create draft / scheduled post
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";
import { randomUUID } from "crypto";

type PostRow = {
  id: string;
  account_id: string;
  content: string | null;
  visibility: string;
  comment_control: string;
  brand_partnership: number;
  post_type: string;
  media_json: string | null;
  poll_json: string | null;
  event_json: string | null;
  document_json: string | null;
  scheduled_at: string | null;
  status: string;
  linkedin_post_urn: string | null;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  account_name?: string | null;
  account_email?: string | null;
};

function serializePost(r: PostRow) {
  return {
    ...r,
    media: r.media_json ? JSON.parse(r.media_json) : [],
    poll: r.poll_json ? JSON.parse(r.poll_json) : null,
    event: r.event_json ? JSON.parse(r.event_json) : null,
    document: r.document_json ? JSON.parse(r.document_json) : null,
    brand_partnership: !!r.brand_partnership,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { status, account_id, limit = "50" } = req.query;
    let sql = `
      SELECT p.*, a.name AS account_name, a.email AS account_email
      FROM linkedin_posts p
      LEFT JOIN accounts a ON a.id = p.account_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    if (status && typeof status === "string") {
      sql += " AND p.status = ?";
      params.push(status);
    }
    if (account_id && typeof account_id === "string") {
      sql += " AND p.account_id = ?";
      params.push(account_id);
    }
    const limitNum = Math.min(Math.max(1, Number(limit) || 50), 200);
    sql += ` ORDER BY COALESCE(p.scheduled_at, p.created_at) DESC LIMIT ${limitNum}`;

    const rows = await dbAll<PostRow>(sql, params);
    return res.json(rows.map(serializePost));
  }

  if (req.method === "POST") {
    const body = (req.body || {}) as Record<string, unknown>;
    const account_id = body.account_id as string | undefined;
    const content = (body.content as string) ?? "";
    const visibility = (body.visibility as string) ?? "anyone";
    const comment_control = (body.comment_control as string) ?? "anyone";
    const brand_partnership = !!body.brand_partnership;
    const post_type = (body.post_type as string) ?? "text";
    const media = (body.media as unknown[]) ?? [];
    const poll = body.poll ?? null;
    const event = body.event ?? null;
    const document = body.document ?? null;
    const scheduled_at = (body.scheduled_at as string | null) ?? null;
    const requestedStatus = body.status as string | undefined;

    if (!account_id) return res.status(400).json({ error: "account_id is required" });

    const account = await dbGet<{ id: string }>("SELECT id FROM accounts WHERE id = ?", [account_id]);
    if (!account) return res.status(404).json({ error: "Account not found" });

    if (visibility !== "anyone" && visibility !== "connections") {
      return res.status(400).json({ error: "visibility must be anyone or connections" });
    }

    let status = requestedStatus || "draft";
    if (scheduled_at) {
      const when = new Date(scheduled_at).getTime();
      if (isNaN(when)) return res.status(400).json({ error: "Invalid scheduled_at" });
      status = "scheduled";
    } else if (status === "scheduled") {
      return res.status(400).json({ error: "scheduled_at required when status is scheduled" });
    }

    if (post_type === "poll" || poll) {
      const p = poll as { question?: string; options?: string[] } | null;
      if (!p?.question || !Array.isArray(p?.options) || p.options.length < 2) {
        return res.status(400).json({ error: "Poll requires question and at least 2 options" });
      }
      if (p.options.length > 4) {
        return res.status(400).json({ error: "Poll supports max 4 options" });
      }
      // LinkedIn does not allow a poll together with media or a document
      if (Array.isArray(media) && media.length > 0) {
        return res.status(400).json({
          error:
            "LinkedIn does not allow polls together with images, videos, or documents. Remove media or the poll.",
        });
      }
      if (document) {
        return res.status(400).json({
          error:
            "LinkedIn does not allow polls together with documents. Remove the document or the poll.",
        });
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await dbRun(`
      INSERT INTO linkedin_posts (
        id, account_id, content, visibility, comment_control, brand_partnership,
        post_type, media_json, poll_json, event_json, document_json,
        scheduled_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      account_id,
      content || null,
      visibility,
      comment_control,
      brand_partnership ? 1 : 0,
      post_type,
      Array.isArray(media) && media.length ? JSON.stringify(media) : null,
      poll ? JSON.stringify(poll) : null,
      event ? JSON.stringify(event) : null,
      document ? JSON.stringify(document) : null,
      scheduled_at || null,
      status,
      now,
      now
    ]);

    const row = await dbGet<PostRow>(`
      SELECT p.*, a.name AS account_name
      FROM linkedin_posts p LEFT JOIN accounts a ON a.id = p.account_id
      WHERE p.id = ?
    `, [id]);

    return res.status(201).json(serializePost(row!));
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
