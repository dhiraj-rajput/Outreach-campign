/**
 * GET  /api/organizations       → current user's org (with member list), or null
 * POST /api/organizations       → create a new org, owned by the caller
 * Body (POST): { name: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getDb } from "@/lib/db";

type MemberRow = { user_id: string; email: string; name: string | null; role: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const db = getDb();

  if (req.method === "GET") {
    const user = db.prepare("SELECT org_id FROM users WHERE id = ?").get(userId) as { org_id: string | null } | undefined;
    if (!user?.org_id) return res.status(200).json({ organization: null });

    const org = db.prepare("SELECT id, name, plan, owner_id, created_at FROM organizations WHERE id = ?").get(user.org_id);
    const members = db
      .prepare(
        `SELECT om.user_id, u.email, u.name, om.role
         FROM organization_members om JOIN users u ON u.id = om.user_id
         WHERE om.org_id = ? ORDER BY om.role = 'owner' DESC, u.email ASC`
      )
      .all(user.org_id) as MemberRow[];

    return res.status(200).json({ organization: org, members });
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Organization name is required" });

    const existing = db.prepare("SELECT org_id FROM users WHERE id = ?").get(userId) as { org_id: string | null } | undefined;
    if (existing?.org_id) return res.status(400).json({ error: "You already belong to an organization" });

    const id = randomUUID();
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO organizations (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, userId);
      db.prepare("INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, 'owner')").run(id, userId);
      db.prepare("UPDATE users SET org_id = ? WHERE id = ?").run(id, userId);
    });
    tx();

    return res.status(201).json({ id, name });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
