import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbRun } from "@/lib/db";

// Per-page product tour "seen" flags, stored as app_settings rows (tour_seen_<page>).
// Single-user tool — no per-account state needed, so a global key/value flag is enough.
const KEY_PREFIX = "tour_seen_";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const rows = await dbAll<{ key: string }>("SELECT `key` FROM app_settings WHERE `key` LIKE ?", [`${KEY_PREFIX}%`]);
    const seen = rows.map((r) => r.key.slice(KEY_PREFIX.length));
    return res.json({ seen });
  }

  if (req.method === "POST") {
    const { page } = req.body as { page?: string };
    if (!page) return res.status(400).json({ error: "page is required" });
    await dbRun(
      `INSERT INTO app_settings (\`key\`, value, updated_at) VALUES (?, '1', NOW())
       ON DUPLICATE KEY UPDATE value = '1', updated_at = NOW()`,
       [`${KEY_PREFIX}${page}`]
    );
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end();
}
