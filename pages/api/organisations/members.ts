import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { dbGet, dbRun, dbTransaction } from "@/lib/db";

type SelfMembership = { org_id: string | null; role: string | null };

async function getCallerMembership(userId: string): Promise<SelfMembership> {
  const row = await dbGet<SelfMembership>(
      `SELECT u.org_id as org_id, om.role as role
       FROM users u LEFT JOIN organization_members om ON om.org_id = u.org_id AND om.user_id = u.id
       WHERE u.id = ?`, [userId]
    );
  return row ?? { org_id: null, role: null };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const caller = await getCallerMembership(userId);
  if (!caller.org_id) return res.status(400).json({ error: "You're not part of an organization" });
  const isSuperAdmin = session?.user?.role === "super_admin";
  if (caller.role !== "owner" && caller.role !== "admin" && !isSuperAdmin) {
    return res.status(403).json({ error: "Only the organization owner or an admin can manage members" });
  }

  if (req.method === "POST") {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) return res.status(400).json({ error: "Email is required" });

    const target = await dbGet<{ id: string; org_id: string | null }>("SELECT id, org_id FROM users WHERE email = ?", [email]);
    if (!target) return res.status(404).json({ error: "No user with that email. They need to sign up first." });
    if (target.org_id) return res.status(400).json({ error: "That user already belongs to an organization" });

    await dbTransaction(async (conn) => {
      await conn.execute("INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, 'member')", [caller.org_id, target.id]);
      await conn.execute("UPDATE users SET org_id = ? WHERE id = ?", [caller.org_id, target.id]);
    });

    return res.status(201).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const targetUserId = typeof req.body?.userId === "string" ? req.body.userId : "";
    if (!targetUserId) return res.status(400).json({ error: "userId is required" });

    const target = await dbGet<{ role: string }>(
      "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?", [caller.org_id, targetUserId]
    );
    if (!target) return res.status(404).json({ error: "That user isn't a member of your organization" });
    if (target.role === "owner") return res.status(400).json({ error: "The org owner can't be removed" });

    await dbTransaction(async (conn) => {
      await conn.execute("DELETE FROM organization_members WHERE org_id = ? AND user_id = ?", [caller.org_id, targetUserId]);
      await conn.execute("UPDATE users SET org_id = NULL WHERE id = ?", [targetUserId]);
    });

    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const targetUserId = typeof req.body?.userId === "string" ? req.body.userId : "";
    const newRole = typeof req.body?.role === "string" ? req.body.role : "";
    if (!targetUserId || (newRole !== "admin" && newRole !== "member")) {
      return res.status(400).json({ error: "Invalid userId or role (must be admin or member)" });
    }

    const target = await dbGet<{ role: string }>(
      "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
      [caller.org_id, targetUserId]
    );
    if (!target) return res.status(404).json({ error: "Member not found" });
    if (target.role === "owner") return res.status(400).json({ error: "Cannot change the owner's role" });

    await dbRun(
      "UPDATE organization_members SET role = ? WHERE org_id = ? AND user_id = ?",
      [newRole, caller.org_id, targetUserId]
    );

    return res.status(200).json({ ok: true, role: newRole });
  }

  res.setHeader("Allow", ["POST", "PATCH", "DELETE"]);
  return res.status(405).end();
}
