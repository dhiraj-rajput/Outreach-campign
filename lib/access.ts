// lib/access.ts — the ONE place that answers "can this user use paid/AI features?"
// and "is this user a super admin?". Every paid-gated API route and every admin-only
// API route should go through requirePaidAccess()/requireSuperAdmin() below instead of
// re-implementing the check, so the rules only ever live in one place.
import type { NextApiRequest, NextApiResponse } from "next";
import type { GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getDb } from "@/lib/db";

export type PlanTier = "free" | "paid";
export type UserRole = "user" | "super_admin";

export interface AccessContext {
  userId: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
  userPlan: PlanTier;
  orgId: string | null;
  orgName: string | null;
  orgPlan: PlanTier | null;
  orgRole: "owner" | "admin" | "member" | null;
  /** True if the user can use paid/AI features right now, for any reason. */
  isPaid: boolean;
}

type UserRow = {
  id: string;
  email: string;
  role: UserRole;
  plan: PlanTier;
  org_id: string | null;
};

type OrgRow = { id: string; name: string; plan: PlanTier };
type MemberRow = { role: "owner" | "admin" | "member" };

/** Comma-separated allowlist, e.g. "founder@linki.dev,ops@linki.dev". Optional bootstrap
 *  mechanism so the very first super admin doesn't need another super admin to promote them.
 *  Re-applied on every login — safe to add/remove emails at any time. */
function envSuperAdmins(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  return new Set(
    raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
}

/** Promotes the user to super_admin if their email is in SUPER_ADMIN_EMAILS and they
 *  aren't already. Called from the NextAuth jwt callback on every sign-in. Cheap no-op
 *  once the role has stuck. */
export function syncEnvSuperAdmin(userId: string, email: string): void {
  if (!envSuperAdmins().has(email.toLowerCase())) return;
  const db = getDb();
  db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ? AND role != 'super_admin'").run(userId);
}

/** Builds the full access context for a user id. Always reads fresh from the DB (SQLite
 *  reads are cheap) so admin plan/role changes take effect immediately, without the user
 *  needing to sign out and back in. */
export function getAccessContextForUser(userId: string): AccessContext | null {
  const db = getDb();
  const user = db
    .prepare("SELECT id, email, role, plan, org_id FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
  if (!user) return null;

  let org: OrgRow | null = null;
  let orgRole: MemberRow["role"] | null = null;
  if (user.org_id) {
    org = (db.prepare("SELECT id, name, plan FROM organizations WHERE id = ?").get(user.org_id) as OrgRow | undefined) ?? null;
    if (org) {
      const member = db
        .prepare("SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?")
        .get(org.id, userId) as MemberRow | undefined;
      orgRole = member?.role ?? null;
    }
  }

  const isSuperAdmin = user.role === "super_admin";
  const isPaid = isSuperAdmin || user.plan === "paid" || org?.plan === "paid";

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    isSuperAdmin,
    userPlan: user.plan,
    orgId: org?.id ?? null,
    orgName: org?.name ?? null,
    orgPlan: org?.plan ?? null,
    orgRole,
    isPaid,
  };
}

/** Server-side (getServerSideProps) variant — resolves the session first. */
export async function getAccessContext(
  ctx: Pick<GetServerSidePropsContext, "req" | "res">
): Promise<AccessContext | null> {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return getAccessContextForUser(userId);
}

/**
 * API-route guard: resolves the session, loads fresh access context, and — unless the
 * user is paid or a super admin — writes a 402 Payment Required response and returns
 * null. Callers should `if (!access) return;` right after invoking this.
 *
 * Usage:
 *   const access = await requirePaidAccess(req, res);
 *   if (!access) return; // response already sent
 */
export async function requirePaidAccess(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AccessContext | null> {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const access = getAccessContextForUser(userId);
  if (!access) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  if (!access.isPaid) {
    res.status(402).json({
      error: "This is a paid feature",
      code: "PAYMENT_REQUIRED",
      upgradeUrl: "/pricing",
    });
    return null;
  }

  return access;
}

/** API-route guard for super-admin-only endpoints (the /api/admin/* surface). */
export async function requireSuperAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AccessContext | null> {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  const access = getAccessContextForUser(userId);
  if (!access || !access.isSuperAdmin) {
    res.status(403).json({ error: "Super admin access required" });
    return null;
  }

  return access;
}
