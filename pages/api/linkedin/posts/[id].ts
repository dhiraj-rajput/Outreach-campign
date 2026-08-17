/**
 * GET    /api/linkedin/posts/:id
 * PATCH  /api/linkedin/posts/:id
 * DELETE /api/linkedin/posts/:id
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbRun } from "@/lib/db";

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
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "id required" });

  const existing = await dbGet<PostRow>("SELECT * FROM linkedin_posts WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Post not found" });

  if (req.method === "GET") {
    return res.json(serializePost(existing));
  }

  if (req.method === "PATCH") {
    const body = (req.body || {}) as Record<string, unknown>;

    if (body.status !== undefined) {
      const st = String(body.status);
      if (!["draft", "scheduled", "cancelled"].includes(st)) {
        return res.status(400).json({ error: "Invalid status transition" });
      }
    }

    if (existing.status === "posted") {
      return res.status(400).json({ error: "Cannot edit a published post" });
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    const map: Record<string, string> = {
      content: "content",
      visibility: "visibility",
      comment_control: "comment_control",
      brand_partnership: "brand_partnership",
      post_type: "post_type",
      scheduled_at: "scheduled_at",
      status: "status",
    };

    for (const [key, col] of Object.entries(map)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = ?`);
        if (key === "brand_partnership") values.push(body[key] ? 1 : 0);
        else values.push(body[key]);
      }
    }

    if (body.media !== undefined) {
      const media = body.media as unknown[] | null;
      fields.push("media_json = ?");
      values.push(media && media.length ? JSON.stringify(media) : null);
    }
    if (body.poll !== undefined) {
      fields.push("poll_json = ?");
      values.push(body.poll ? JSON.stringify(body.poll) : null);
    }
    if (body.event !== undefined) {
      fields.push("event_json = ?");
      values.push(body.event ? JSON.stringify(body.event) : null);
    }
    if (body.document !== undefined) {
      fields.push("document_json = ?");
      values.push(body.document ? JSON.stringify(body.document) : null);
    }

    if (body.scheduled_at && !body.status) {
      fields.push("status = ?");
      values.push("scheduled");
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    await dbRun(`UPDATE linkedin_posts SET ${fields.join(", ")} WHERE id = ?`, values);

    const row = await dbGet<PostRow>("SELECT * FROM linkedin_posts WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "Post not found after update" });
    return res.json(serializePost(row));
  }

  if (req.method === "DELETE") {
    if (existing.status === "posting") {
      return res.status(400).json({ error: "Cannot delete a post that is currently being published" });
    }
    await dbRun("DELETE FROM linkedin_posts WHERE id = ?", [id]);
    return res.status(204).end();
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  return res.status(405).end();
}
