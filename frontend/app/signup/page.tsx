"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { DM_Sans } from "next/font/google";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API       = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const EMAIL_RE  = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const SPECIAL   = /[!@#$%^&*()\-_=+\[\]{}|;:',.<>?/`~"\\]/;

function criteriaScore(pw: string): number {
  return [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    SPECIAL.test(pw),
  ].filter(Boolean).length;
}

export default function SignupPage() {
  const router = useRouter();

  const [email,         setEmail]         = useState("");
  const [emailTouched,  setEmailTouched]  = useState(false);
  const [password,      setPassword]      = useState("");
  const [confirm,       setConfirm]       = useState("");
  const [confirmTouched,setConfirmTouched]= useState(false);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState(false);
  const [loading,       setLoading]       = useState(false);

  const emailValid   = EMAIL_RE.test(email);
  const pwScore      = criteriaScore(password);
  const pwValid      = pwScore === 5;
  const confirmValid = confirm === password && confirm.length > 0;
  const formValid    = emailValid && pwValid && confirmValid;

  const emailError   = emailTouched && email && !emailValid ? "Enter a valid email" : "";
  const confirmError = confirmTouched && confirm && !confirmValid ? "Passwords don't match" : "";

  const handleSignup = async () => {
    setError("");
    if (!formValid) return;

    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/register`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.detail ?? "Registration failed.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-bg fixed inset-0 z-50 flex items-center justify-center">
        <div className="auth-card-animate text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-semibold text-lg">Account created!</p>
          <p className="text-[#64748b] text-sm mt-2">Redirecting to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`auth-bg fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8 ${dmSans.className}`}>
      <div className="w-full max-w-md px-4 auth-card-animate">

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <ShieldIcon />
            <span className="text-white font-bold text-3xl tracking-tight">JobNest</span>
          </div>
          <p className="text-[#475569] text-sm">Create your secure account</p>
        </div>

        {/* Glass card */}
        <div className="auth-glass rounded-2xl p-8 space-y-5">
          <h2 className="text-white font-semibold text-lg">Sign up</h2>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/40 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="auth-label">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailTouched) setError(""); }}
              onBlur={() => setEmailTouched(true)}
              autoComplete="email"
              className={`auth-input ${emailError ? "border-red-500/60 focus:ring-red-500/20" : ""}`}
              placeholder="you@example.com"
            />
            {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="auth-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="auth-input"
              placeholder="Create a strong password"
            />
            <PasswordStrengthMeter password={password} />
          </div>

          {/* Confirm password */}
          <div className="space-y-1">
            <label className="auth-label">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setConfirmTouched(true); }}
              autoComplete="new-password"
              className={`auth-input ${confirmError ? "border-red-500/60 focus:ring-red-500/20" : ""}`}
              placeholder="Repeat your password"
            />
            {confirmError && <p className="text-red-400 text-xs mt-1">{confirmError}</p>}
          </div>

          <button
            onClick={handleSignup}
            disabled={loading || !formValid}
            className="auth-btn-primary w-full"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#1e2640]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-transparent px-3 text-[#334155]">or continue with</span>
            </div>
          </div>

          {/* OAuth buttons */}
          <div className="space-y-3">
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="auth-btn-oauth w-full"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <button
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="auth-btn-oauth w-full"
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          </div>

          <p className="text-center text-sm text-[#475569]">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2 mt-5 text-xs text-[#334155]">
          <LockIcon />
          <span>256-bit encrypted · Secured by JWT</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ShieldIcon() {
  return (
    <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}
