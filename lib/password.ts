/**
 * Password strength utilities — shared by signup API and login UI.
 * Keep rules in one place so client and server stay aligned.
 */

export type PasswordCheck = {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: "too weak" | "weak" | "fair" | "good" | "strong";
  errors: string[];
  hints: string[];
};

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "qwerty123", "letmein", "welcome", "admin123", "iloveyou",
  "monkey123", "abc12345",
]);

export function validatePassword(password: string, email?: string): PasswordCheck {
  const errors: string[] = [];
  const hints: string[] = [];
  let score = 0 as PasswordCheck["score"];

  if (typeof password !== "string" || password.length === 0) {
    return {
      ok: false, score: 0, label: "too weak",
      errors: ["Password is required."],
      hints: ["Use at least 8 characters with mixed case, a number, and a symbol."],
    };
  }

  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters.`);
  } else {
    score = (score + 1) as PasswordCheck["score"];
  }

  if (password.length > MAX_LENGTH) {
    errors.push(`Password must be at most ${MAX_LENGTH} characters.`);
  }

  if (!/[a-z]/.test(password)) errors.push("Add at least one lowercase letter.");
  else score = Math.min(4, score + 1) as PasswordCheck["score"];

  if (!/[A-Z]/.test(password)) errors.push("Add at least one uppercase letter.");
  else score = Math.min(4, score + 1) as PasswordCheck["score"];

  if (!/[0-9]/.test(password)) errors.push("Add at least one number.");
  else score = Math.min(4, score + 1) as PasswordCheck["score"];

  if (!/[^A-Za-z0-9]/.test(password)) {
    hints.push("Adding a symbol (e.g. ! @ # $) makes the password stronger.");
  } else {
    score = Math.min(4, score + 1) as PasswordCheck["score"];
  }

  if (password.length >= 12) score = Math.min(4, score + 1) as PasswordCheck["score"];

  const lower = password.toLowerCase();
  if (COMMON.has(lower)) {
    errors.push("This password is too common.");
    score = 0;
  }

  if (email) {
    const local = email.split("@")[0]?.toLowerCase() ?? "";
    if (local.length >= 3 && lower.includes(local)) {
      errors.push("Password should not contain your email.");
      score = Math.min(score, 1) as PasswordCheck["score"];
    }
  }

  if (errors.length > 0) score = Math.min(score, 1) as PasswordCheck["score"];

  const label: PasswordCheck["label"] =
    score <= 0 ? "too weak" : score === 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";

  return {
    ok: errors.length === 0 && password.length >= MIN_LENGTH,
    score: Math.min(4, Math.max(0, score)) as PasswordCheck["score"],
    label, errors, hints,
  };
}

export function validateEmail(email: string): { ok: boolean; error?: string } {
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, error: "Email is required." };
  }
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (trimmed.length > 254) return { ok: false, error: "Email is too long." };
  return { ok: true };
}

export function validateName(name: string): { ok: boolean; error?: string; value: string } {
  const value = (name ?? "").trim();
  if (!value) return { ok: false, error: "Name is required.", value: "" };
  if (value.length < 2) return { ok: false, error: "Name must be at least 2 characters.", value };
  if (value.length > 80) return { ok: false, error: "Name must be at most 80 characters.", value };
  return { ok: true, value };
}
