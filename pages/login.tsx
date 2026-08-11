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
    <div className="space-y-1.5 mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: check.score > i ? STRENGTH_COLORS[check.score] : "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium capitalize" style={{ color: STRENGTH_COLORS[check.score] }}>{check.label}</span>
        {check.errors[0] && <span className="text-[11px] text-error/90 truncate">{check.errors[0]}</span>}
      </div>
      {check.ok && check.hints[0] && <p className="text-[11px] text-base-content/40">{check.hints[0]}</p>}
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) { setMode(next); setError(""); setConfirmPassword(""); }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) { setLoading(false); setError(emailCheck.error ?? "Invalid email."); return; }
    const res = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
    setLoading(false);
    if (res?.ok) router.replace("/");
    else if (res?.error === "Too many attempts. Try again later.") setError(res.error);
    else setError("Incorrect email or password.");
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) { setLoading(false); setError(emailCheck.error ?? "Invalid email."); return; }
    const nameCheck = validateName(name);
    if (!nameCheck.ok) { setLoading(false); setError(nameCheck.error ?? "Name is required."); return; }
    const normalizedEmail = email.trim().toLowerCase();
    const pw = validatePassword(password, normalizedEmail);
    if (!pw.ok) { setLoading(false); setError(pw.errors[0] ?? "Password is too weak."); return; }
    if (!confirmPassword) { setLoading(false); setError("Please confirm your password."); return; }
    if (password !== confirmPassword) { setLoading(false); setError("Passwords do not match."); return; }
    if (!inviteCode.trim()) { setLoading(false); setError("Invite code is required."); return; }

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        passwordConfirm: confirmPassword,
        inviteCode: inviteCode.trim(),
        name: nameCheck.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setLoading(false); setError(data.error ?? "Something went wrong."); return; }

    const signInRes = await signIn("credentials", { email: normalizedEmail, password, redirect: false });
    setLoading(false);
    if (signInRes?.ok) router.replace("/");
    else { setError("Account created but sign-in failed. Try signing in manually."); switchMode("signin"); }
  }

  return (
    <>
      <Head>
        <title>{mode === "signin" ? "Sign in" : "Create account"} — Linki</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen bg-base-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 mb-8">
            <Image src="/logo_linki.png" alt="Linki" width={40} height={40} className="rounded-xl" />
            <div className="text-center">
              <h1 className="text-base-content font-semibold text-lg">Linki</h1>
              <p className="text-base-content/50 text-sm">
                {mode === "signin" ? "Sign in to continue" : "Create your account"}
              </p>
            </div>
          </div>

          <div className="flex bg-base-300/50 rounded-lg p-1 mb-4">
            <button type="button" onClick={() => switchMode("signin")}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors font-medium ${mode === "signin" ? "bg-base-200 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>
              Sign in
            </button>
            <button type="button" onClick={() => switchMode("signup")}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors font-medium ${mode === "signup" ? "bg-base-200 text-base-content shadow-sm" : "text-base-content/40 hover:text-base-content/70"}`}>
              Sign up
            </button>
          </div>

          <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="flex flex-col gap-3.5">
            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Full name</label>
                <div className="relative">
                  <RiUserLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                  <input type="text" className="input input-sm w-full pl-8 bg-base-300 border-base-300/50 focus:outline-none focus:border-primary/50"
                    placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Email</label>
              <div className="relative">
                <RiMailLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                <input type="email" className="input input-sm w-full pl-8 bg-base-300 border-base-300/50 focus:outline-none focus:border-primary/50"
                  placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" required />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Password</label>
              <div className="relative">
                <RiLockPasswordLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                <input type={showPassword ? "text" : "password"}
                  className="input input-sm w-full pl-8 pr-9 bg-base-300 border-base-300/50 focus:outline-none focus:border-primary/50"
                  placeholder={mode === "signup" ? "8+ chars, upper, lower, number" : "Your password"}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/30 hover:text-base-content/60"
                  aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <RiEyeOffLine size={15} /> : <RiEyeLine size={15} />}
                </button>
              </div>
              {mode === "signup" && <PasswordStrengthBar password={password} email={email} />}

            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">
                  Confirm password
                </label>
                <div className="relative">
                  <RiLockPasswordLine
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    className="input input-sm w-full pl-8 bg-base-300 border-base-300/50 focus:outline-none focus:border-primary/50"
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

            </div>

            {mode === "signup" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-base-content/50 font-medium uppercase tracking-wider">Invite code</label>
                <div className="relative">
                  <RiKeyLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/30" />
                  <input type="password" className="input input-sm w-full pl-8 bg-base-300 border-base-300/50 focus:outline-none focus:border-primary/50"
                    placeholder="Ask your admin for the invite code" value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)} autoComplete="off" required />
                </div>
              </div>
            )}

            {error && <p className="text-xs text-error">{error}</p>}

            <button type="submit" disabled={loading} className="btn btn-primary btn-sm w-full mt-1">
              {loading ? <span className="loading loading-spinner loading-xs" /> : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {mode === "signup" && (
            <p className="text-[11px] text-base-content/35 text-center mt-4 leading-relaxed">
              Passwords need 8+ characters with uppercase, lowercase, and a number. Avoid common passwords and your email local-part.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
