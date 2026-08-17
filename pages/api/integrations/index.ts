import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll, dbRun } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const rows = await dbAll<{
      key: string;
      api_key: string | null;
      model: string | null;
      updated_at: string;
    }>("SELECT `key`, api_key, model, updated_at FROM integrations");
    const masked = rows.map((r) => {
      const plain = decryptSecret(r.api_key);
      return {
        key: r.key,
        model: r.model ?? null,
        updated_at: r.updated_at,
        api_key_masked: plain ? "••••••••" + plain.slice(-4) : null,
        configured: !!plain,
      };
    });
    return res.json(masked);
  }

  if (req.method === "POST") {
    const { key, api_key, model } = req.body;
    if (!key) return res.status(400).json({ error: "key required" });
    if (!api_key) return res.status(400).json({ error: "api_key required" });
    await dbRun(`
      INSERT INTO integrations (\`key\`, api_key, model, updated_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        api_key = VALUES(api_key),
        model = COALESCE(VALUES(model), integrations.model),
        updated_at = VALUES(updated_at)
    `, [key, encryptSecret(api_key), model ?? null]);
    return res.json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: "key required" });
    await dbRun("DELETE FROM integrations WHERE \`key\` = ?", [key]);
    return res.json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  res.status(405).end();
}
