"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Status = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [status,  setStatus]  = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
      return;
    }

    const controller = new AbortController();

    fetch(`${API}/auth/verify-email?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage(data.message ?? "Email verified successfully.");
        } else {
          setStatus("error");
          setMessage(data.detail ?? "Verification failed.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return; // StrictMode cleanup — ignore
        setStatus("error");
        setMessage("Could not reach the server. Please try again.");
      });

    return () => controller.abort();
  }, [token]);

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
          {status === "loading" && (
            <>
              <div className="w-14 h-14 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin mx-auto" />
              <p className="text-[#94a3b8] text-sm">Verifying your email…</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-xl mb-2">Email verified!</h2>
                <p className="text-[#94a3b8] text-sm">{message}</p>
              </div>
              <Link href="/login" className="auth-btn-primary w-full flex items-center justify-center">
                Sign in to your account
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-semibold text-xl mb-2">Verification failed</h2>
                <p className="text-[#94a3b8] text-sm">{message}</p>
              </div>
              <div className="space-y-2">
                <Link href="/login" className="auth-btn-primary w-full flex items-center justify-center">
                  Back to sign in
                </Link>
                <p className="text-xs text-[#475569]">
                  Need a new link?{" "}
                  <Link href="/login" className="text-blue-400 hover:text-blue-300 transition-colors">
                    Sign in and we&apos;ll resend it
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="auth-bg fixed inset-0 z-50" />}>
      <VerifyEmailContent />
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
