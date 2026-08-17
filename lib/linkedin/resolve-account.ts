import { dbAll, dbGet } from "@/lib/db";

export interface ResolvedAccount {
  id: string;
  email: string;
}

/**
 * Resolve which authenticated LinkedIn account to act through for a contact.
 * Order: explicit id → the contact's most recent run assignment → the sole
 * authenticated account. Only ever returns an `is_authenticated = 1` account
 * so callers never drive a dead session.
 */
export async function resolveLinkedInAccount(
  targetId: string,
  explicitId?: string
): Promise<ResolvedAccount | null> {
  const byId = async (aid: string) =>
    await dbGet<ResolvedAccount>(
      "SELECT id, email FROM accounts WHERE id = ? AND is_authenticated = 1",
      [aid]
    );

  if (explicitId) return (await byId(explicitId)) ?? null;

  const assigned = await dbGet<{ account_id: string }>(
    `SELECT r.account_id FROM run_profiles rp
     JOIN runs r ON r.id = rp.run_id
     WHERE rp.target_id = ?
     ORDER BY rp.created_at DESC LIMIT 1`,
    [targetId]
  );
  if (assigned?.account_id) {
    const a = await byId(assigned.account_id);
    if (a) return a;
  }

  const all = await dbAll<ResolvedAccount>(
    "SELECT id, email FROM accounts WHERE is_authenticated = 1"
  );
  return all.length === 1 ? all[0] : null;
}

/**
 * Resolve an authenticated LinkedIn account when there's no target/contact to
 * anchor the lookup to (e.g. Sales Navigator search, which runs before any
 * lead exists locally). Order: explicit id → the sole authenticated account.
 */
export async function resolveAnyAuthenticatedAccount(
  explicitId?: string
): Promise<ResolvedAccount | null> {
  const byId = async (aid: string) =>
    await dbGet<ResolvedAccount>(
      "SELECT id, email FROM accounts WHERE id = ? AND is_authenticated = 1",
      [aid]
    );

  if (explicitId) return (await byId(explicitId)) ?? null;

  const all = await dbAll<ResolvedAccount>(
    "SELECT id, email FROM accounts WHERE is_authenticated = 1"
  );
  return all.length === 1 ? all[0] : null;
}
