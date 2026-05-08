"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function VerifyEmailSentContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resent,   setResent]   = useState(false);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await fetch(`${API}/auth/resend-verification`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
    } catch {
      // Silently ignore network errors — response is always 200
    } finally {
      setResending(false);
      setResent(true);
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
        </div>

        {/* Glass card */}
        <div className="auth-glass rounded-2xl p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>

          <div>
            <h2 className="text-white font-semibold text-xl mb-2">Check your email</h2>
            <p className="text-[#94a3b8] text-sm leading-relaxed">
              We sent a verification link to{" "}
              {email && <strong className="text-white">{email}</strong>}.
              Click the link to activate your account.
            </p>
          </div>

          <div className="text-xs text-[#475569] bg-[#0b0f1c] border border-[#1e2640] rounded-xl px-4 py-3 text-left space-y-1">
            <p className="font-medium text-[#64748b]">Didn&apos;t get it?</p>
            <ul className="list-disc list-inside space-y-0.5 text-[#475569]">
              <li>Check your spam or junk folder</li>
              <li>Make sure the address above is correct</li>
            </ul>
          </div>

          {resent ? (
            <p className="text-emerald-400 text-sm">Verification email resent!</p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending || !email}
              className="auth-btn-oauth w-full"
            >
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          )}

          <p className="text-center text-sm text-[#475569]">
            Already verified?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailSentPage() {
  return (
    <Suspense fallback={<div className="auth-bg fixed inset-0 z-50" />}>
      <VerifyEmailSentContent />
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
