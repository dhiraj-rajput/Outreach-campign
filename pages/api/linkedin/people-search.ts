import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet } from "@/lib/db";
import { searchPeople } from "@/lib/linkedin/people-search";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * POST /api/linkedin/people-search
 * Body: { keywords: string, account_id?: string, page?: number, limit?: number }
 *
 * Uses an authenticated LinkedIn account session. Rate-limited per IP and
 * intentionally slow (browser automation). Prefer small pages.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  // Throttle abuse of the search endpoint (browser work is expensive + account risk)
  if (isRateLimited(req, "li-people-search", 8, 10 * 60 * 1000)) {
    return res.status(429).json({
      error: "Too many searches. Wait a few minutes before trying again.",
    });
  }

  const { keywords, account_id, page, limit } = req.body as {
    keywords?: string;
    account_id?: string;
    page?: number;
    limit?: number;
  };

  if (!keywords || typeof keywords !== "string" || keywords.trim().length < 2) {
    return res.status(400).json({ error: "keywords is required (min 2 characters)." });
  }

  let accountId = account_id;
  if (!accountId) {
    const row = await dbGet<{ id: string }>(
      `SELECT id FROM accounts
       WHERE is_authenticated = 1 AND cookies_json IS NOT NULL
       ORDER BY created_at ASC LIMIT 1`
    );
    if (!row) {
      return res.status(400).json({
        error: "No authenticated LinkedIn account. Connect one under Settings → Accounts.",
      });
    }
    accountId = row.id;
  }

  const account = await dbGet<{ id: string; name: string; email: string; is_authenticated: number; cookies_json: string | null }>(
    `SELECT id, name, email, is_authenticated, cookies_json FROM accounts WHERE id = ?`,
    [accountId]
  );

  if (!account) return res.status(404).json({ error: "Account not found." });
  if (!account.is_authenticated || !account.cookies_json) {
    return res.status(400).json({
      error: `Account "${account.name}" is not authenticated. Re-authenticate in Settings.`,
    });
  }

  console.log(
    `[api/people-search] account=${account.id} keywords="${keywords.trim()}" page=${page ?? 1}`
  );

  try {
    const result = await searchPeople(account.id, keywords, {
      page: typeof page === "number" ? page : 1,
      limit: typeof limit === "number" ? limit : 25,
    });

    return res.status(200).json({
      ...result,
      account: { id: account.id, name: account.name, email: account.email },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "People search failed";
    console.error(`[api/people-search] error:`, message);
    const needsAuth = /re-auth|checkpoint|login|auth wall/i.test(message);
    return res.status(needsAuth ? 401 : 500).json({ error: message });
  }
}

// Browser automation can exceed default serverless limits when self-hosted.
export const config = {
  api: { bodyParser: { sizeLimit: "32kb" }, externalResolver: true },
};
