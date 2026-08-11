import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";
import { validateEmail, validateName, validatePassword } from "@/lib/password";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  if (isRateLimited(req, "signup", 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }

  const { email, password, inviteCode, name } = req.body as {
    email?: string; password?: string; inviteCode?: string; name?: string;
  };

  if (!email || !password || !inviteCode) {
    return res.status(400).json({ error: "Email, password, and invite code are required." });
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
  if (!authPassword) {
    return res.status(500).json({ error: "AUTH_PASSWORD is not configured on this server." });
  }
  if (inviteCode !== authPassword) {
    return res.status(403).json({ error: "Invalid invite code." });
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const hash = await bcrypt.hash(password, 12);
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)")
      .run(id, normalizedEmail, hash, nameCheck.value);
  } catch {
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)")
      .run(id, normalizedEmail, hash);
  }

  return res.status(201).json({ ok: true, email: normalizedEmail, name: nameCheck.value });
}
