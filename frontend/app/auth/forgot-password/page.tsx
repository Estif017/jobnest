"use client";

import { useState } from "react";
import Link from "next/link";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API      = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const emailValid = EMAIL_RE.test(email);

  const handleSubmit = async () => {
    if (!emailValid) return;
    setError("");
    setLoading(true);
    try {
      await fetch(`${API}/auth/forgot-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
        signal:  AbortSignal.timeout(8000),
      });
      setSent(true);
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

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
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-xl mb-2">Check your email</h2>
                <p className="text-[#94a3b8] text-sm leading-relaxed">
                  If <strong className="text-white">{email.trim()}</strong> is registered, we&apos;ve
                  sent a reset link. Check your inbox and spam folder.
                </p>
              </div>
              <Link href="/login" className="auth-btn-primary w-full flex items-center justify-center">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-white font-semibold text-lg">Reset your password</h2>
                <p className="text-[#64748b] text-sm mt-1">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/40 rounded-xl px-4 py-2.5">
                  {error}
                </p>
              )}

              <div className="space-y-1">
                <label className="auth-label">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  autoComplete="email"
                  autoFocus
                  className="auth-input"
                  placeholder="you@example.com"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading || !emailValid}
                className="auth-btn-primary w-full"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <p className="text-center text-sm text-[#475569]">
                Remembered it?{" "}
                <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
                  Sign in
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
