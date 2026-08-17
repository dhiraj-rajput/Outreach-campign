import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getAccessContextForUser } from "@/lib/access";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const access = await getAccessContextForUser(userId);
  if (!access) return res.status(404).json({ error: "User not found" });

  return res.status(200).json(access);
}
