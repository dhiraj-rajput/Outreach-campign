import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { dbAll, dbGet, dbRun, dbTransaction } from "@/lib/db";

type MemberRow = { user_id: string; email: string; name: string | null; role: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  if (req.method === "GET") {
    const user = await dbGet<{ org_id: string | null }>("SELECT org_id FROM users WHERE id = ?", [userId]);
    if (!user?.org_id) return res.status(200).json({ organization: null });

    const org = await dbGet<{ id: string; name: string; invite_code: string | null; plan: string; owner_id: string; created_at: string }>(
      "SELECT id, name, invite_code, plan, owner_id, created_at FROM organizations WHERE id = ?",
      [user.org_id]
    );

    if (org && !org.invite_code) {
      const generatedCode = "ORG-" + randomUUID().substring(0, 8).toUpperCase();
      await dbRun("UPDATE organizations SET invite_code = ? WHERE id = ?", [generatedCode, org.id]);
      org.invite_code = generatedCode;
    }

    const members = await dbAll<MemberRow>(
      `SELECT om.user_id, u.email, u.name, om.role
       FROM organization_members om JOIN users u ON u.id = om.user_id
       WHERE om.org_id = ? ORDER BY om.role = 'owner' DESC, u.email ASC`,
      [user.org_id]
    );

    return res.status(200).json({ organization: org, members });
  }

  if (req.method === "POST") {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "Organization name is required" });

    const existing = await dbGet<{ org_id: string | null }>("SELECT org_id FROM users WHERE id = ?", [userId]);
    if (existing?.org_id) return res.status(400).json({ error: "You already belong to an organization" });

    const id = randomUUID();
    const inviteCode = "ORG-" + randomUUID().substring(0, 8).toUpperCase();
    await dbTransaction(async (conn) => {
      await conn.execute(
        "INSERT INTO organizations (id, name, invite_code, owner_id) VALUES (?, ?, ?, ?)",
        [id, name, inviteCode, userId]
      );
      await conn.execute(
        "INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, 'owner')",
        [id, userId]
      );
      await conn.execute("UPDATE users SET org_id = ? WHERE id = ?", [id, userId]);
    });

    return res.status(201).json({ id, name, invite_code: inviteCode });
  }

  if (req.method === "PATCH") {
    const user = await dbGet<{ org_id: string | null }>("SELECT org_id FROM users WHERE id = ?", [userId]);
    if (!user?.org_id) return res.status(400).json({ error: "You do not belong to an organization" });

    const member = await dbGet<{ role: string }>(
      "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
      [user.org_id, userId]
    );
    const isSuperAdmin = session?.user?.role === "super_admin";
    if (member?.role !== "owner" && member?.role !== "admin" && !isSuperAdmin) {
      return res.status(403).json({ error: "Only organization owners or admins can edit organization details" });
    }

    const { name, regenerateInviteCode } = req.body as { name?: string; regenerateInviteCode?: boolean };

    if (name && typeof name === "string" && name.trim()) {
      await dbRun("UPDATE organizations SET name = ? WHERE id = ?", [name.trim(), user.org_id]);
    }

    let newInviteCode: string | null = null;
    if (regenerateInviteCode) {
      newInviteCode = "ORG-" + randomUUID().substring(0, 8).toUpperCase();
      await dbRun("UPDATE organizations SET invite_code = ? WHERE id = ?", [newInviteCode, user.org_id]);
    }

    const updatedOrg = await dbGet(
      "SELECT id, name, invite_code, plan, owner_id, created_at FROM organizations WHERE id = ?",
      [user.org_id]
    );
    return res.status(200).json({ ok: true, organization: updatedOrg });
  }

  if (req.method === "DELETE") {
    const user = await dbGet<{ org_id: string | null }>("SELECT org_id FROM users WHERE id = ?", [userId]);
    if (!user?.org_id) return res.status(400).json({ error: "You do not belong to an organization" });

    const member = await dbGet<{ role: string }>(
      "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
      [user.org_id, userId]
    );

    if (member?.role === "owner") {
      // Owner deletes the organization
      await dbTransaction(async (conn) => {
        await conn.execute("UPDATE users SET org_id = NULL WHERE org_id = ?", [user.org_id]);
        await conn.execute("DELETE FROM organization_members WHERE org_id = ?", [user.org_id]);
        await conn.execute("DELETE FROM organizations WHERE id = ?", [user.org_id]);
      });
      return res.status(200).json({ ok: true, deleted: true });
    } else {
      // Member leaves the organization
      await dbTransaction(async (conn) => {
        await conn.execute("DELETE FROM organization_members WHERE org_id = ? AND user_id = ?", [user.org_id, userId]);
        await conn.execute("UPDATE users SET org_id = NULL WHERE id = ?", [userId]);
      });
      return res.status(200).json({ ok: true, left: true });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).end();
}
