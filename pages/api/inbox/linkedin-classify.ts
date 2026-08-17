/**
 * POST /api/inbox/linkedin-classify
 *
 * Classifies the intent of a LinkedIn reply for a given target.
 * Uses OpenRouter (configured in Settings → Integrations).
 *
 * Body: { targetId: string }
 * Returns: { intent, confidence, suggested_action }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { dbGet, dbRun } from "@/lib/db";
import { classifyLinkedInReply } from "@/lib/ai/linkedin-classifier";
import { requirePaidAccess } from "@/lib/access";

interface Target {
  id: string;
  full_name: string | null;
  last_replied_at: string | null;
  li_last_message_sent: string | null;
  li_intent: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const access = await requirePaidAccess(req, res);
  if (!access) return;

  const { targetId } = req.body as { targetId?: string };
  if (!targetId) return res.status(400).json({ error: "targetId required" });

  const target = await dbGet<Target>(
    "SELECT id, full_name, last_replied_at, li_last_message_sent, li_intent FROM targets WHERE id = ?",
    [targetId]
  );

  if (!target) return res.status(404).json({ error: "Target not found" });
  if (!target.last_replied_at) return res.status(400).json({ error: "Target has no LinkedIn reply" });

  // Fetch the LinkedIn reply text from inbox sync
  // The LinkedIn reply body is stored in the sync-accepted messages table (last_linkedin_message on run_profile_tracks)
  const trackRow = await dbGet<{ last_linkedin_message: string | null }>(`
    SELECT rpt.last_linkedin_message
    FROM run_profile_tracks rpt
    JOIN run_profiles rp ON rp.id = rpt.run_profile_id
    WHERE rp.target_id = ? AND rpt.track = 'linkedin'
    ORDER BY rpt.last_step_at DESC LIMIT 1
  `, [targetId]);

  // We can also look for a synced reply body in the inbox_messages table if present
  let replyBody: { body: string } | undefined;
  try {
    replyBody = (await dbGet<{ body: string }>(`
      SELECT body FROM linkedin_inbox_messages
      WHERE target_id = ? ORDER BY received_at DESC LIMIT 1
    `, [targetId])) ?? undefined;
  } catch {
    /* table or row may not exist yet */
  }

  const replyText = replyBody?.body ?? "(LinkedIn reply received — no message body captured)";
  const ourLastMessage = target.li_last_message_sent ?? trackRow?.last_linkedin_message ?? "";
  const senderName = target.full_name ?? "Unknown";

  const result = await classifyLinkedInReply(replyText, senderName, ourLastMessage);

  if (result.confidence === 0) {
    return res.status(400).json({ error: result.suggested_action || "AI classification failed — configure API key in Settings" });
  }

  // Persist classification to the target row
  await dbRun(`
    UPDATE targets SET
      li_intent = ?,
      li_intent_at = NOW(),
      li_intent_action = ?
    WHERE id = ?
  `, [result.intent, result.suggested_action, targetId]);

  return res.json(result);
}
