import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbTransaction } from "@/lib/db";

// POST /api/lists/[id]/sync-status  body: { account_id: number }
// Re-fetches the Sales Nav list and updates degree for non-connected targets.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const listId = req.query.id as string;

  const list = await dbGet<{ sales_nav_url?: string }>("SELECT * FROM lists WHERE id = ?", [listId]);
  if (!list) return res.status(404).json({ error: "List not found" });
  if (!list.sales_nav_url) return res.status(400).json({ error: "No Sales Navigator URL saved for this list — run an import first" });

  const { account_id } = req.body as { account_id: string };
  if (!account_id) return res.status(400).json({ error: "account_id required" });

  const account = await dbGet<{ cookies_json: string | null; is_authenticated: number }>(
    "SELECT * FROM accounts WHERE id = ?",
    [account_id]
  );
  if (!account?.is_authenticated) return res.status(400).json({ error: "Account not authenticated" });

  const { getSessionContext } = await import("@/lib/linkedin/session");
  const { scrapeNavigatorList } = await import("@/lib/linkedin/scraper");

  try {
    const ctx = await getSessionContext(account_id);
    const { profiles } = await scrapeNavigatorList(ctx, list.sales_nav_url, { maxPages: 300 });

    let updated = 0;
    await dbTransaction(async (conn) => {
      for (const p of profiles) {
        if (p.degree === 1) {
          await conn.execute(`
            UPDATE targets SET degree = ?, connected_at = CASE
              WHEN (degree IS NULL OR degree != 1) AND connected_at IS NULL THEN NOW()
              ELSE connected_at
            END
            WHERE linkedin_url = ?
          `, [p.degree, p.salesNavUrl]);
        } else {
          await conn.execute("UPDATE targets SET degree = ? WHERE linkedin_url = ?", [p.degree, p.salesNavUrl]);
        }
        updated++;
      }
    });

    return res.json({ updated, total: profiles.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

export const config = {
  api: { responseLimit: false },
};
