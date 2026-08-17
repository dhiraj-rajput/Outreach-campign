import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./[...nextauth]";
import bcrypt from "bcryptjs";
import { dbGet, dbRun } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) return res.status(401).json({ error: "Not authenticated" });

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const user = await dbGet<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE email = ?",
    [session.user.email]
  );

  if (!user) return res.status(404).json({ error: "User not found." });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(400).json({ error: "Current password is incorrect." });

  const hash = await bcrypt.hash(newPassword, 10);
  await dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);

  return res.status(200).json({ ok: true });
}
