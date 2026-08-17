import type { NextApiRequest, NextApiResponse } from "next";
import { recordClick } from "@/lib/email/tracking";

// Public route — excluded from the session-auth gate in proxy.ts.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw ?? "";

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "";
  const userAgent = (req.headers["user-agent"] as string) || "";

  const destination = id ? await recordClick(id, userAgent, ip) : null;
  return res.redirect(302, destination || "/");
}
