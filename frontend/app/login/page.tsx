"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { getProviders, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const API      = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Map NextAuth error codes to human-readable messages
function oauthError(error: string | null): string {
  switch (error) {
    case "OAuthSignin":
    case "OAuthCallback":
      return "OAuth sign-in failed. Verify the callback URL is registered in your provider console.";
    case "OAuthAccountNotLinked":
      return "This email is already linked to a different sign-in method. Use your original method.";
    case "Callback":
    case "OAuthCreateAccount":
      return "Sign-in failed. Please try again.";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Inner component — reads searchParams (requires Suspense boundary)
// ---------------------------------------------------------------------------

function LoginContent() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const errorParam  = searchParams.get("error");

  const [email,        setEmail]        = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password,     setPassword]     = useState("");
  const [pwTouched,    setPwTouched]    = useState(false);
  const [error,        setError]        = useState(oauthError(errorParam));
  const [unverified,   setUnverified]   = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [providers,    setProviders]    = useState<Record<string, { id: string }> | null>(null);

  useEffect(() => {
    getProviders().then((p) => setProviders((p as Record<string, { id: string }>) ?? {}));
  }, []);

  const emailValid = EMAIL_RE.test(email);
  const emailError = emailTouched && email && !emailValid ? "Please enter a valid email" : "";
  const pwError    = pwTouched && !password ? "Password is required" : "";

  const handleLogin = async () => {
    setEmailTouched(true);
    setPwTouched(true);
    if (!emailValid || !password) return;

    setError("");
    setUnverified(false);
    setLoading(true);

    // Pre-check with the backend to surface 403 (unverified) before calling signIn
    try {
      const precheck = await fetch(`${API}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
        signal:  AbortSignal.timeout(8000),
      });
      if (precheck.status === 403) {
        setUnverified(true);
        setLoading(false);
        return;
      }
      if (precheck.status === 423) {
        const body = await precheck.json().catch(() => ({}));
        setError(body.detail ?? "Account locked. Try again later.");
        setLoading(false);
        return;
      }
      if (!precheck.ok) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      setError(isTimeout
        ? "Request timed out. The backend may be overloaded — try again."
        : "Could not reach the server. Is the backend running?");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
    } else {
      router.push("/");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  const googleEnabled = providers?.["google"] !== undefined;
  const githubEnabled = providers?.["github"] !== undefined;
  const anyOAuth      = googleEnabled || githubEnabled;
  const providersLoaded = providers !== null;

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
          <h2 className="text-white font-semibold text-lg">Sign in</h2>

          {error && (
            <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/40 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          {unverified && (
            <div className="text-yellow-300 text-sm bg-yellow-950/40 border border-yellow-800/40 rounded-xl px-4 py-3 space-y-1">
              <p className="font-medium">Please verify your email before signing in.</p>
              <p className="text-xs text-yellow-400/80">
                Check your inbox for the verification link.{" "}
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`${API}/auth/resend-verification`, {
                      method:  "POST",
                      headers: { "Content-Type": "application/json" },
                      body:    JSON.stringify({ email }),
                    }).catch(() => {});
                    setUnverified(false);
                    setError("Verification email resent. Check your inbox.");
                  }}
                  className="underline hover:text-yellow-200 transition-colors"
                >
                  Resend verification email
                </button>
              </p>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="auth-label">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onBlur={() => setEmailTouched(true)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
              className={`auth-input ${emailError ? "border-red-500/60 focus:ring-red-500/20" : ""}`}
              placeholder="you@example.com"
            />
            {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
          </div>

          {/* Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="auth-label" style={{ marginBottom: 0 }}>Password</label>
              <Link
                href="/auth/forgot-password"
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); setUnverified(false); }}
              onBlur={() => setPwTouched(true)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
              className={`auth-input ${pwError ? "border-red-500/60 focus:ring-red-500/20" : ""}`}
              placeholder="••••••••"
            />
            {pwError && <p className="text-red-400 text-xs mt-1">{pwError}</p>}
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="auth-btn-primary w-full"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          {/* OAuth section — only shown once providers are loaded and at least one is available */}
          {providersLoaded && anyOAuth && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1e2640]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-transparent px-3 text-[#334155]">or continue with</span>
                </div>
              </div>

              <div className="space-y-3">
                {googleEnabled && (
                  <button
                    onClick={() => signIn("google", { callbackUrl: "/" })}
                    className="auth-btn-oauth w-full"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>
                )}
                {githubEnabled && (
                  <button
                    onClick={() => signIn("github", { callbackUrl: "/" })}
                    className="auth-btn-oauth w-full"
                  >
                    <GitHubIcon />
                    Continue with GitHub
                  </button>
                )}
              </div>
            </>
          )}

          <p className="text-center text-sm text-[#475569]">
            No account?{" "}
            <Link href="/signup" className="text-blue-400 hover:text-blue-300 transition-colors">
              Sign up
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
// Page export — Suspense required for useSearchParams in App Router
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-bg fixed inset-0 z-50" />}>
      <LoginContent />
    </Suspense>
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
