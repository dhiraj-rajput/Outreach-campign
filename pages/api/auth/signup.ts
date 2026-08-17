import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { dbGet, dbRun, dbTransaction } from "@/lib/db";
import { randomUUID } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";
import { validateEmail, validateName, validatePassword } from "@/lib/password";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  if (isRateLimited(req as any, "signup", 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const { email, password, passwordConfirm, inviteCode, name } = req.body as {
    email?: string; password?: string; passwordConfirm?: string; inviteCode?: string; name?: string;
  };

  if (!email || !password || !inviteCode) {
    return res.status(400).json({ error: "Email, password, and invite code are required." });
  }

  if (typeof passwordConfirm !== "string" || !passwordConfirm) {
    return res.status(400).json({ error: "Please confirm your password." });
  }
  if (password !== passwordConfirm) {
    return res.status(400).json({ error: "Passwords do not match." });
  }

  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
  const normalizedEmail = email.trim().toLowerCase();

  const nameCheck = validateName(name ?? "");
  if (!nameCheck.ok) return res.status(400).json({ error: nameCheck.error ?? "Name is required." });

  const pw = validatePassword(password, normalizedEmail);
  if (!pw.ok) {
    return res.status(400).json({
      error: pw.errors[0] ?? "Password does not meet strength requirements.",
      passwordErrors: pw.errors,
      passwordHints: pw.hints,
      passwordScore: pw.score,
    });
  }

  const authPassword = process.env.AUTH_PASSWORD;
  const trimmedCode = inviteCode.trim();

  let targetOrgId: string | null = null;
  let targetOrgPlan = "free";

  if (authPassword && trimmedCode === authPassword) {
    // Valid platform individual invite code
    targetOrgId = null;
  } else {
    // Check if it matches an organization invite code
    const org = await dbGet<{ id: string; name: string; plan: string }>(
      "SELECT id, name, plan FROM organizations WHERE UPPER(invite_code) = UPPER(?)",
      [trimmedCode]
    );
    if (org) {
      targetOrgId = org.id;
      targetOrgPlan = org.plan;
    } else {
      return res.status(403).json({ error: "Invalid invite code. Please enter a valid organization or invite code." });
    }
  }

  const existing = await dbGet("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const hash = await bcrypt.hash(password, 12);
  const id = randomUUID();

  if (targetOrgId) {
    await dbTransaction(async (conn) => {
      await conn.execute(
        "INSERT INTO users (id, email, password_hash, name, role, plan, org_id) VALUES (?, ?, ?, ?, 'user', ?, ?)",
        [id, normalizedEmail, hash, nameCheck.value ?? null, targetOrgPlan, targetOrgId]
      );
      await conn.execute(
        "INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, 'member')",
        [targetOrgId, id]
      );
    });
  } else {
    await dbRun(
      "INSERT INTO users (id, email, password_hash, name, role, plan) VALUES (?, ?, ?, ?, 'user', 'free')",
      [id, normalizedEmail, hash, nameCheck.value ?? null]
    );
  }

  return res.status(201).json({ ok: true, email: normalizedEmail, name: nameCheck.value });
}
