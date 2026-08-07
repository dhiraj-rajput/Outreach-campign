import type { NextApiRequest, NextApiResponse } from "next";
import { hasPremium as rawHasPremium } from "@/lib/premium";
import { getDb } from "@/lib/db";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  let hasPremium = rawHasPremium;

  if (!hasPremium) {
    try {
      const db = getDb();
      const aiRow = db
        .prepare("SELECT 1 FROM integrations WHERE key IN ('gemini', 'google', 'openrouter', 'claude') AND api_key IS NOT NULL AND api_key != ''")
        .get();
      // Unlock premium UI features if AI key is configured or in dev testing
      if (aiRow || process.env.NODE_ENV !== "production") {
        hasPremium = true;
      }
    } catch {
      hasPremium = true;
    }
  }

  res.status(200).json({ hasPremium });
}
