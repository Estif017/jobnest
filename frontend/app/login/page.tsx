"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router   = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

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

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-white font-bold text-3xl tracking-tight">JobNest</span>
          <p className="text-[#525252] text-sm mt-2">AI-powered job application tracker</p>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-8 space-y-5">
          <h2 className="text-white font-semibold text-lg">Sign in</h2>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[#a3a3a3] text-xs uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2.5 focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
