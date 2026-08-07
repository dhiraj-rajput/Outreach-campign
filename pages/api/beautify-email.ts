import type { NextApiRequest, NextApiResponse } from "next";
import { beautifyEmail, type BeautifyStyle } from "@/lib/ai/beautify-email";

// Gated by proxy.ts's default session-auth check (not in PUBLIC_API_PREFIXES).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end();
  }

  const { subject, body, style } = req.body as { subject?: string; body?: string; style?: BeautifyStyle };
  if (!body || !body.trim()) {
    return res.status(400).json({ error: "body is required" });
  }

  const result = await beautifyEmail(subject ?? "", body, style ?? "professional");
  return res.json(result);
}
