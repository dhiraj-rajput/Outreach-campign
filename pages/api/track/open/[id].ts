import type { NextApiRequest, NextApiResponse } from "next";
import { TRANSPARENT_PNG, recordOpen } from "@/lib/email/tracking";

// Public route — excluded from the session-auth gate in proxy.ts (email clients, not
// browsers, request this). Must ALWAYS return the pixel, even if the DB write fails.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", "image/png");

  const raw = req.query.id;
  const id = (Array.isArray(raw) ? raw[0] : raw ?? "").replace(/\.png$/i, "");

  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "";
  const userAgent = (req.headers["user-agent"] as string) || "";

  if (id) recordOpen(id, userAgent, ip);

  return res.status(200).send(TRANSPARENT_PNG);
}
