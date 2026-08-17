/**
 * GET   /api/admin/users                → list every user (with plan, role, org)
 * PATCH /api/admin/users   Body: { userId, plan?, role? }  → update a user's plan/role
 * Super-admin only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperAdmin } from "@/lib/access";
import { dbAll, dbGet, dbRun } from "@/lib/db";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
  org_id: string | null;
  org_name: string | null;
  created_at: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const users = await dbAll<UserRow>(
        `SELECT u.id, u.email, u.name, u.role, u.plan, u.org_id, o.name as org_name, u.created_at
         FROM users u LEFT JOIN organizations o ON o.id = u.org_id
         ORDER BY u.created_at DESC`
      );
    return res.status(200).json({ users });
  }

  if (req.method === "PATCH") {
    const { userId, plan, role } = req.body as { userId?: string; plan?: string; role?: string };
    if (!userId) return res.status(400).json({ error: "userId is required" });

    if (plan !== undefined) {
      if (plan !== "free" && plan !== "paid") return res.status(400).json({ error: "plan must be 'free' or 'paid'" });
      await dbRun("UPDATE users SET plan = ?, plan_updated_at = NOW() WHERE id = ?", [plan, userId]);
    }
    if (role !== undefined) {
      if (role !== "user" && role !== "super_admin") return res.status(400).json({ error: "role must be 'user' or 'super_admin'" });
      // Guard against a super admin locking themselves out by demoting the last admin.
      if (role === "user" && userId === admin.userId) {
        const otherAdmins = await dbGet<{ n: number }>("SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND id != ?", [userId]);
        if (otherAdmins?.n === 0) {
          return res.status(400).json({ error: "You're the only super admin — promote someone else first" });
        }
      }
      await dbRun("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH"]);
  return res.status(405).end();
}
