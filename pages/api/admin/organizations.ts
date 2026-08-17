/**
 * GET   /api/admin/organizations               → list every organization
 * PATCH /api/admin/organizations  Body: { orgId, plan } → force an org's plan
 * Super-admin only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperAdmin } from "@/lib/access";
import { dbAll, dbRun } from "@/lib/db";

type OrgRow = {
  id: string;
  name: string;
  plan: string;
  owner_email: string;
  member_count: number;
  created_at: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const organizations = await dbAll<OrgRow>(
        `SELECT o.id, o.name, o.plan, u.email as owner_email,
                (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.id) as member_count,
                o.created_at
         FROM organizations o JOIN users u ON u.id = o.owner_id
         ORDER BY o.created_at DESC`
      );
    return res.status(200).json({ organizations });
  }

  if (req.method === "PATCH") {
    const { orgId, plan } = req.body as { orgId?: string; plan?: string };
    if (!orgId || (plan !== "free" && plan !== "paid")) {
      return res.status(400).json({ error: "orgId and a valid plan ('free' | 'paid') are required" });
    }
    await dbRun("UPDATE organizations SET plan = ?, plan_updated_at = NOW() WHERE id = ?", [plan, orgId]);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH"]);
  return res.status(405).end();
}
