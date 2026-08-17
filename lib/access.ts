// lib/access.ts — the ONE place that answers "can this user use paid/AI features?"
// and "is this user a super admin?". Every paid-gated API route and every admin-only
// API route should go through requirePaidAccess()/requireSuperAdmin() below instead of
// re-implementing the check, so the rules only ever live in one place.
import type { NextApiRequest, NextApiResponse } from "next";
import type { GetServerSidePropsContext } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { dbGet, dbRun } from "@/lib/db";

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
  /** True if the organization feature is unlocked (organization plan is paid or super admin). */
  hasOrgAccess: boolean;
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

/** Builds the full access context for a user id. Always reads fresh from the DB (SQLite
 *  reads are cheap) so admin plan/role changes take effect immediately, without the user
 *  needing to sign out and back in. */
export async function getAccessContextForUser(userId: string): Promise<AccessContext | null> {
  const user = await dbGet<UserRow>(
    "SELECT id, email, role, plan, org_id FROM users WHERE id = ?",
    [userId]
  );
  if (!user) return null;

  let org: OrgRow | null = null;
  let orgRole: MemberRow["role"] | null = null;
  if (user.org_id) {
    const orgResult = await dbGet<OrgRow>("SELECT id, name, plan FROM organizations WHERE id = ?", [user.org_id]);
    org = orgResult ?? null;
    if (org) {
      const member = await dbGet<MemberRow>(
        "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
        [org.id, userId]
      );
      orgRole = member?.role ?? null;
    }
  }

  const isSuperAdmin = user.role === "super_admin";
  const isPaid = isSuperAdmin || user.plan === "paid" || org?.plan === "paid";
  const hasOrgAccess = isSuperAdmin || (Boolean(org) && org?.plan === "paid");

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
    hasOrgAccess,
  };
}

/** Server-side (getServerSideProps) variant — resolves the session first. */
export async function getAccessContext(
  ctx: Pick<GetServerSidePropsContext, "req" | "res">
): Promise<AccessContext | null> {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return await getAccessContextForUser(userId);
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

  const access = await getAccessContextForUser(userId);
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

  const access = await getAccessContextForUser(userId);
  if (!access || !access.isSuperAdmin) {
    res.status(403).json({ error: "Super admin access required" });
    return null;
  }

  return access;
}

/**
 * Coerces a step-save payload's `ai_enabled` flag down to false unless the CURRENT
 * session (the person saving the step) has paid access. This is the write-time half of
 * the AI paywall for workflow steps — the read-time half is hasAnyPaidAccess() below,
 * used by the send runner as defense-in-depth for rows written before this existed.
 *
 * Workflows in this app aren't owned by a single user (no owner column — any signed-in
 * teammate can edit any workflow), so "is this workflow's owner paid?" isn't a
 * meaningful question; what matters is whether the person doing the save right now is
 * authorized to turn AI on at all.
 */
export async function coerceAiEnabled(
  req: NextApiRequest,
  res: NextApiResponse,
  requestedAiEnabled: unknown
): Promise<boolean> {
  const wants = Boolean(requestedAiEnabled) && requestedAiEnabled !== 0;
  if (!wants) return false;

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return false;

  const access = await getAccessContextForUser(userId);
  return Boolean(access?.isPaid);
}

/**
 * True if ANY user or organization in this instance currently has paid access (paid
 * plan or super admin). Used by the send runner as a defense-in-depth check before
 * honoring a step's stored `ai_enabled` flag, since workflow_steps rows have no owner to
 * check individually — this catches rows that were written before coerceAiEnabled()
 * existed, or written directly against the DB, from ever running AI generation once
 * nobody paid anymore.
 */
export async function hasAnyPaidAccess(): Promise<boolean> {
  const paidUser = await dbGet("SELECT 1 FROM users WHERE plan = 'paid' OR role = 'super_admin' LIMIT 1");
  if (paidUser) return true;
  const paidOrg = await dbGet("SELECT 1 FROM organizations WHERE plan = 'paid' LIMIT 1");
  return Boolean(paidOrg);
}
