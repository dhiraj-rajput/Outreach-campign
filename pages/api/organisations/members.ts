/**
 * POST   /api/organizations/members   Body: { email }              → add an existing user to your org
 * DELETE /api/organizations/members   Body: { userId }              → remove a member from your org
 * Only the org owner or an admin member may call this.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getDb } from "@/lib/db";

type SelfMembership = { org_id: string | null; role: string | null };

function getCallerMembership(db: ReturnType<typeof getDb>, userId: string): SelfMembership {
  const row = db
    .prepare(
      `SELECT u.org_id as org_id, om.role as role
       FROM users u LEFT JOIN organization_members om ON om.org_id = u.org_id AND om.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as SelfMembership | undefined;
  return row ?? { org_id: null, role: null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const db = getDb();
  const caller = getCallerMembership(db, userId);
  if (!caller.org_id) return res.status(400).json({ error: "You're not part of an organization" });
  if (caller.role !== "owner" && caller.role !== "admin") {
    return res.status(403).json({ error: "Only the org owner or an admin can manage members" });
  }

  if (req.method === "POST") {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ error: "Email is required" });

    const target = db.prepare("SELECT id, org_id FROM users WHERE email = ?").get(email) as
      | { id: string; org_id: string | null }
      | undefined;
    if (!target) return res.status(404).json({ error: "No user with that email. They need to sign up first." });
    if (target.org_id) return res.status(400).json({ error: "That user already belongs to an organization" });

    const tx = db.transaction(() => {
      db.prepare("INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, 'member')").run(caller.org_id, target.id);
      db.prepare("UPDATE users SET org_id = ? WHERE id = ?").run(caller.org_id, target.id);
    });
    tx();

    return res.status(201).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const targetUserId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!targetUserId) return res.status(400).json({ error: "userId is required" });

    const target = db
      .prepare("SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?")
      .get(caller.org_id, targetUserId) as { role: string } | undefined;
    if (!target) return res.status(404).json({ error: "That user isn't a member of your organization" });
    if (target.role === "owner") return res.status(400).json({ error: "The org owner can't be removed" });

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM organization_members WHERE org_id = ? AND user_id = ?").run(caller.org_id, targetUserId);
      db.prepare("UPDATE users SET org_id = NULL WHERE id = ?").run(targetUserId);
    });
    tx();

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["POST", "DELETE"]);
  return res.status(405).end();
}
