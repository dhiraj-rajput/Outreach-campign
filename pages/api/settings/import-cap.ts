import type { NextApiRequest, NextApiResponse } from "next";
import { getDailyImportCap, setDailyImportCap, DEFAULT_DAILY_CAP } from "@/lib/import-jobs";

/** GET → { cap }, PUT { cap } → set the global daily import cap. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.json({ cap: await getDailyImportCap(), default: DEFAULT_DAILY_CAP });
  }

  if (req.method === "PUT") {
    const { cap } = req.body as { cap?: number };
    const n = Number(cap);
    if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: "cap must be a positive number" });
    await setDailyImportCap(null, n);
    return res.json({ cap: await getDailyImportCap() });
  }

  res.setHeader("Allow", ["GET", "PUT"]);
  return res.status(405).end();
}
