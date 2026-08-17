import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbAll, dbTransaction } from "@/lib/db";
import { getSessionPage, saveSessionState } from "@/lib/linkedin/session";
import { scrapePendingInvitationVanityNames } from "@/lib/linkedin/pending-invitations";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const accountId = req.query.id as string;

  const account = await dbGet<{ id: string; is_authenticated: number }>("SELECT id, is_authenticated FROM accounts WHERE id = ?", [accountId]);

  if (!account) return res.status(404).json({ error: "Account not found" });
  if (!account.is_authenticated) return res.status(400).json({ error: "Account not authenticated" });

  let page;
  try {
    page = await getSessionPage(accountId);
    const stillPending = await scrapePendingInvitationVanityNames(page);
    await saveSessionState(accountId);

    // Find all targets that we sent a request to but haven't marked as connected
    const waiting = await dbAll<{ id: string; linkedin_url: string; full_name: string | null }>(`
      SELECT id, linkedin_url, full_name
      FROM targets
      WHERE connection_requested_at IS NOT NULL
      AND (degree IS NULL OR degree != 1)
      AND connected_at IS NULL
    `);

    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const accepted: string[] = [];
    const skipped: string[] = [];

    await dbTransaction(async (conn) => {
      for (const target of waiting) {
        const match = target.linkedin_url?.match(/\/in\/([^/?#]+)/);
        if (!match) continue; // no /in/ URL — can't check
        const vanity = match[1].toLowerCase();

        if (!stillPending.has(vanity)) {
          // Not in the pending list anymore → accepted (or expired, but treat as accepted)
          await conn.execute("UPDATE targets SET degree = 1, connected_at = ? WHERE id = ?", [now, target.id]);
          accepted.push(target.full_name ?? vanity);
        } else {
          skipped.push(target.full_name ?? vanity);
        }
      }
    });

    return res.json({
      pending_on_linkedin: stillPending.size,
      waiting_in_db: waiting.length,
      newly_accepted: accepted.length,
      still_pending: skipped.length,
      accepted_names: accepted,
    });

  } catch (err) {
    console.error("[sync-accepted]", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  } finally {
    await page?.close().catch(() => {});
  }
}
