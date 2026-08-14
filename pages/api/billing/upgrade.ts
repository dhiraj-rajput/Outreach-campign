/**
 * POST /api/billing/upgrade
 * Body: { scope: "self" | "org" }
 *
 * ⚠️ PAYMENT GATEWAY PLACEHOLDER ⚠️
 * No payment provider is wired in yet. This route currently flips the plan to 'paid'
 * directly, so the rest of the app (pricing page, paywalls, admin panel) has a working
 * upgrade flow to build and test against today.
 *
 * When you pick a gateway (Stripe, Paddle, Lemon Squeezy, …), replace the body of this
 * handler with "create a Checkout session and redirect the user there", and instead flip
 * the plan from your webhook handler (e.g. pages/api/billing/webhook.ts) once the gateway
 * confirms payment — never on this request directly, since that would let anyone grant
 * themselves a paid plan for free. Search this file's name in the codebase if you move it.
 *
 * scope: "self"  → upgrades the calling user's personal plan.
 * scope: "org"   → upgrades the calling user's organization (requires owner/admin role
 *                  in that org); every member of the org gets paid access.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getDb } from "@/lib/db";
import { getAccessContextForUser } from "@/lib/access";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const scope = (req.body?.scope as string) === "org" ? "org" : "self";
  const access = getAccessContextForUser(userId);
  if (!access) return res.status(404).json({ error: "User not found" });

  const db = getDb();

  if (scope === "org") {
    if (!access.orgId) {
      return res.status(400).json({ error: "You're not part of an organization yet. Create one first." });
    }
    if (access.orgRole !== "owner" && access.orgRole !== "admin" && !access.isSuperAdmin) {
      return res.status(403).json({ error: "Only the organization owner or an admin can upgrade the org plan" });
    }
    db.prepare("UPDATE organizations SET plan = 'paid', plan_updated_at = datetime('now') WHERE id = ?").run(access.orgId);
  } else {
    db.prepare("UPDATE users SET plan = 'paid', plan_updated_at = datetime('now') WHERE id = ?").run(userId);
  }

  const updated = getAccessContextForUser(userId);
  return res.status(200).json(updated);
}
