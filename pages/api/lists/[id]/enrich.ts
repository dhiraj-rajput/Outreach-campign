import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const listId = req.query.id as string;

  const list = await dbGet("SELECT * FROM lists WHERE id = ?", [listId]);
  if (!list) return res.status(404).json({ error: "List not found" });

  const { account_id } = req.body;
  if (!account_id) return res.status(400).json({ error: "account_id required" });

  const account = await dbGet<{ cookies_json: string | null; is_authenticated: number }>(
    "SELECT * FROM accounts WHERE id = ?",
    [account_id]
  );
  if (!account) return res.status(400).json({ error: "Account not found" });
  if (!account.is_authenticated || !account.cookies_json) {
    return res.status(400).json({ error: "Account not authenticated" });
  }

  const pending = await dbGet<{ c: number }>(`
    SELECT COUNT(*) as c FROM targets t
    JOIN list_targets lt ON lt.target_id = t.id
    WHERE lt.list_id = ? AND t.sales_nav_url IS NOT NULL AND t.enriched_profile_at IS NULL
  `, [listId]);

  // Respond immediately — enrichment runs in background
  res.json({ started: true, profiles: pending?.c ?? 0 });

  // Fire and forget — do not await
  setImmediate(async () => {
    try {
      const { getSessionContext } = await import("@/lib/linkedin/session");
      const { enrichList } = await import("@/lib/linkedin/enrich");
      const ctx = await getSessionContext(account_id);
      await enrichList(ctx, listId);
    } catch (err) {
      console.error("[enrich] background enrichment failed:", err instanceof Error ? err.message : err);
    }
  });
}

export const config = {
  api: { responseLimit: false },
};
