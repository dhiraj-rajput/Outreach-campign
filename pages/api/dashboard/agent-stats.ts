import type { NextApiRequest, NextApiResponse } from "next";
import { dbAll } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 7), 90);

    const daily = await dbAll<{ day: string; cost_usd: number; input_tokens: number; output_tokens: number }>(`
      SELECT
        DATE(created_at) AS day,
        SUM(cost_usd) AS cost_usd,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens
      FROM agent_sessions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    // Fill missing days with zeros
    const filled: typeof daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = daily.find(r => r.day === key);
      filled.push(found ?? { day: key, cost_usd: 0, input_tokens: 0, output_tokens: 0 });
    }

    res.json({ daily: filled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load agent stats" });
  }
}
