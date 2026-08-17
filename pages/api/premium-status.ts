import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getAccessContextForUser } from "@/lib/access";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = session?.user?.id;

  if (userId) {
    const access = await getAccessContextForUser(userId);
    if (access?.isSuperAdmin || access?.isPaid) {
      return res.status(200).json({ hasPremium: true });
    }
  }

  return res.status(200).json({ hasPremium: false });
}
