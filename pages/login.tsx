import Head from "next/head";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import {
  RiLockPasswordLine, RiMailLine, RiKeyLine, RiUserLine, RiEyeLine, RiEyeOffLine,
} from "react-icons/ri";
import { validateEmail, validateName, validatePassword } from "@/lib/password";

type Mode = "signin" | "signup";
const STRENGTH_COLORS = ["#f87171", "#fb923c", "#f4b740", "#5aa2ff", "#32d583"];

function PasswordStrengthBar({ password, email }: { password: string; email: string }) {
  const check = useMemo(() => validatePassword(password, email), [password, email]);
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              background: i <= check.score ? STRENGTH_COLORS[check.score] : "var(--color-base-300)",
            }}
          />
        ))}
      </div>
      <p className="text-[11px] mt-1 capitalize" style={{ color: STRENGTH_COLORS[check.score] }}>
        {check.label}
      </p>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.error ?? "Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password.");
        return;
      }
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const nameCheck = validateName(name);
    if (!nameCheck.ok) {
      setError(nameCheck.error ?? "Name is required.");
      return;
    }
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.error ?? "Enter a valid email address.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const pw = validatePassword(password, email);
    if (!pw.ok) {
      setError(pw.errors[0] ?? "Password does not meet strength requirements.");
      return;
    }
    if (!inviteCode) {
      setError("Invite code is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: email.trim().toLowerCase(),
          password,
          passwordConfirm: confirmPassword,
          inviteCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create account.");
        return;
      }

      const signInRes = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        setError("Account created — please sign in.");
        switchMode("signin");
        return;
      }
      router.push("/");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{mode === "signin" ? "Sign in" : "Create account"} — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen bg-base-100 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[95vw] sm:max-w-[380px]">
          <div className="flex flex-col items-center gap-3 mb-7">
            <Image src="/logo_linki.png" alt="Linki" width={36} height={36} className="rounded-lg" />
            <div className="text-center">
              <h1 className="text-base-content font-semibold text-base tracking-tight">Linki</h1>
              <p className="text-base-content/45 text-sm mt-0.5">
                {mode === "signin" ? "Sign in to continue" : "Create your account"}
              </p>
            </div>
          </div>

          <div className="surface p-5 sm:p-6">
            <div className="flex bg-base-300/40 rounded-lg p-1 mb-5">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors font-medium ${
                  mode === "signin"
                    ? "bg-base-200 text-base-content shadow-sm"
                    : "text-base-content/40 hover:text-base-content/70"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors font-medium ${
                  mode === "signup"
                    ? "bg-base-200 text-base-content shadow-sm"
                    : "text-base-content/40 hover:text-base-content/70"
                }`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="flex flex-col gap-3.5">
              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Full name</label>
                  <div className="relative">
                    <RiUserLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                    <input
                      type="text"
                      className="input input-sm w-full pl-8 bg-base-100 border-base-300/60"
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Email</label>
                <div className="relative">
                  <RiMailLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                  <input
                    type="email"
                    className="input input-sm w-full pl-8 bg-base-100 border-base-300/60"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Password</label>
                <div className="relative">
                  <RiLockPasswordLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input input-sm w-full pl-8 pr-9 bg-base-100 border-base-300/60"
                    placeholder={mode === "signup" ? "8+ chars, upper, lower, number" : "Your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/30 hover:text-base-content/60"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <RiEyeOffLine size={15} /> : <RiEyeLine size={15} />}
                  </button>
                </div>
                {mode === "signup" && <PasswordStrengthBar password={password} email={email} />}
              </div>

              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Confirm password</label>
                  <div className="relative">
                    <RiLockPasswordLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                    <input
                      type={showPassword ? "text" : "password"}
                      className="input input-sm w-full pl-8 bg-base-100 border-base-300/60"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-[11px] text-error/90">Passwords do not match.</p>
                  )}
                  {confirmPassword.length > 0 && password === confirmPassword && (
                    <p className="text-[11px] text-success/80">Passwords match.</p>
                  )}
                </div>
              )}

              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Invite code</label>
                  <div className="relative">
                    <RiKeyLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                    <input
                      type="text"
                      className="input input-sm w-full pl-8 bg-base-100 border-base-300/60"
                      placeholder="Organization code (ORG-...) or invite code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-error">{error}</p>}

              <button type="submit" disabled={loading} className="btn btn-primary btn-sm w-full mt-1">
                {loading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : mode === "signin" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            {mode === "signup" && (
              <p className="text-[11px] text-base-content/35 text-center mt-4 leading-relaxed">
                Passwords need 8+ characters with uppercase, lowercase, and a number. Avoid common passwords and your email local-part.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
