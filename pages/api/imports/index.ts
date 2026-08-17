import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll } from "@/lib/db";
import { getDailyImportCap, importedToday } from "@/lib/import-jobs";

/** GET — all import jobs (active first), with list names, for the Jobs panel. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end();
  }

  const jobs = await dbAll(`
    SELECT li.id, li.list_id, l.name AS list_name, li.status, li.phase,
           li.page, li.total_pages, li.count, li.total, li.imported, li.skipped, li.error,
           li.scheduled_for, li.start_page, li.batch_index, li.started_at, li.finished_at
    FROM list_imports li
    LEFT JOIN lists l ON l.id = li.list_id
    WHERE li.status IN ('running', 'scheduled')
       OR li.finished_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
    ORDER BY
      CASE li.status WHEN 'running' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
      li.scheduled_for ASC,
      li.started_at DESC
  `);

  return res.json({
    jobs,
    dailyCap: await getDailyImportCap(),
    importedToday: await importedToday(),
  });
}
