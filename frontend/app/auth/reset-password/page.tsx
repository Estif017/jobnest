"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { DM_Sans } from "next/font/google";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API     = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SPECIAL = /[!@#$%^&*()\-_=+\[\]{}|;:',.<>?/`~"\\]/;

function criteriaScore(pw: string): number {
  return [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    SPECIAL.test(pw),
  ].filter(Boolean).length;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [password,       setPassword]       = useState("");
  const [confirm,        setConfirm]        = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error,          setError]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [success,        setSuccess]        = useState(false);

  const pwScore      = criteriaScore(password);
  const pwValid      = pwScore === 5;
  const confirmValid = confirm === password && confirm.length > 0;
  const formValid    = pwValid && confirmValid && !!token;
  const confirmError = confirmTouched && confirm && !confirmValid ? "Passwords don't match" : "";

  const handleSubmit = async () => {
    if (!formValid) return;
    setError("");
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/reset-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? "Reset failed. The link may have expired.");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className={`auth-bg fixed inset-0 z-50 flex items-center justify-center ${dmSans.className}`}>
        <div className="auth-glass rounded-2xl p-8 text-center max-w-sm mx-4">
          <p className="text-red-400 text-sm mb-4">Invalid reset link. Please request a new one.</p>
          <Link href="/auth/forgot-password" className="auth-btn-primary w-full flex items-center justify-center">
            Request new link
          </Link>
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
          <p className="text-[#475569] text-sm">AI-powered job application tracker</p>
        </div>

        {/* Glass card */}
        <div className="auth-glass rounded-2xl p-8 space-y-5">
          {success ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-xl mb-2">Password reset!</h2>
                <p className="text-[#94a3b8] text-sm">Redirecting you to sign in…</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-white font-semibold text-lg">Choose a new password</h2>
                <p className="text-[#64748b] text-sm mt-1">
                  Pick a strong password for your JobNest account.
                </p>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/40 rounded-xl px-4 py-2.5">
                  {error}
                </p>
              )}

              {/* New password */}
              <div className="space-y-1">
                <label className="auth-label">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  className="auth-input"
                  placeholder="Create a strong password"
                />
                <PasswordStrengthMeter password={password} />
              </div>

              {/* Confirm */}
              <div className="space-y-1">
                <label className="auth-label">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setConfirmTouched(true); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="new-password"
                  className={`auth-input ${confirmError ? "border-red-500/60 focus:ring-red-500/20" : ""}`}
                  placeholder="Repeat your password"
                />
                {confirmError && <p className="text-red-400 text-xs mt-1">{confirmError}</p>}
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !formValid}
                className="auth-btn-primary w-full"
              >
                {loading ? "Saving…" : "Reset password"}
              </button>

              <p className="text-center text-sm text-[#475569]">
                <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="auth-bg fixed inset-0 z-50" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

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
