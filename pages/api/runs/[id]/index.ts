import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbGet, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;

  if (req.method === "GET") {
    const run = await dbGet(
      `SELECT r.*,
              w.name as workflow_name,
              l.name as list_name,
              a.name as account_name
       FROM runs r
       LEFT JOIN workflows w ON w.id = r.workflow_id
       LEFT JOIN lists l ON l.id = r.list_id
       LEFT JOIN accounts a ON a.id = r.account_id
       WHERE r.id = ?`,
      [id]
    );
    if (!run) return res.status(404).json({ error: "not found" });

    // Paging + optional target_id filter — a run can hold hundreds of profiles, so callers
    // (incl. the MCP) can page or pull a single contact instead of the whole set.
    const targetId = req.query.target_id as string | undefined;
    const hasPaging = req.query.limit !== undefined || req.query.page !== undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = (Number(req.query.page) || 0) * limit;

    const profileWhere = targetId ? "rp.run_id = ? AND rp.target_id = ?" : "rp.run_id = ?";
    const profileArgs: unknown[] = targetId ? [id, targetId] : [id];
    const profilesTotalRow = await dbGet<{ c: number }>(
      `SELECT COUNT(*) as c FROM run_profiles rp WHERE ${profileWhere}`,
      profileArgs
    );
    const profilesTotal = profilesTotalRow?.c ?? 0;

    const pageClause = (targetId || hasPaging) ? " LIMIT ? OFFSET ?" : "";
    const pageArgs = (targetId || hasPaging) ? [limit, offset] : [];

    const profiles = await dbAll(
      `SELECT rp.id, rp.run_id, rp.target_id, rp.email_account_id, rp.created_at,
              COALESCE(rt_li.state, 'pending') as state,
              COALESCE(rt_li.current_step, 0) as current_step,
              rt_li.next_step_at, rt_li.error_message,
              rt_email.state as email_state,
              rt_email.current_step as email_current_step,
              t.full_name, t.linkedin_url, t.title, t.company
       FROM run_profiles rp
       LEFT JOIN targets t ON t.id = rp.target_id
       LEFT JOIN run_profile_tracks rt_li ON rt_li.run_profile_id = rp.id AND rt_li.track = 'linkedin'
       LEFT JOIN run_profile_tracks rt_email ON rt_email.run_profile_id = rp.id AND rt_email.track = 'email'
       WHERE ${profileWhere}
       ORDER BY rp.id${pageClause}`,
      [...profileArgs, ...pageArgs]
    );

    const logs = await dbAll(
      `SELECT lg.*, t.full_name as target_name
       FROM logs lg
       LEFT JOIN targets t ON t.id = lg.target_id
       WHERE lg.run_id = ?
       ORDER BY lg.created_at DESC
       LIMIT 100`,
      [id]
    );

    return res.json({ ...run as object, profiles, profiles_total: profilesTotal, logs });
  }

  if (req.method === "PATCH") {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status required" });
    await dbRun("UPDATE runs SET status = ? WHERE id = ?", [status, id]);
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    await dbRun("DELETE FROM runs WHERE id = ?", [id]);
    return res.json({ ok: true });
  }

  res.status(405).end();
}
