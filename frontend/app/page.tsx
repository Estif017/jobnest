"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { fetchDashboardStats, fetchJobs, DashboardStats, Job } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import FitScore from "@/components/FitScore";
import LoadingSpinner from "@/components/LoadingSpinner";

const kpis = [
  {
    key: "total",
    label: "Total Tracked",
    accent: "var(--blue)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      </svg>
    ),
  },
  {
    key: "applied",
    label: "Applications Sent",
    accent: "var(--accent)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/>
      </svg>
    ),
  },
  {
    key: "interviewing",
    label: "Interviewing",
    accent: "var(--yellow)",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    key: "response",
    label: "Response Rate",
    accent: "var(--green)",
    suffix: "%",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
];

const nextActions = [
  { label: "Scan for new jobs",      href: "/scan",    desc: "Find and score matching roles" },
  { label: "Review your top matches", href: "/jobs",    desc: "See fit scores across saved jobs" },
  { label: "Talk to your coach",      href: "/coach",   desc: "Get interview prep or advice" },
];

export default function Dashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs,  setJobs]  = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    Promise.all([fetchDashboardStats(), fetchJobs()])
      .then(([s, j]) => { setStats(s); setJobs(j); })
      .catch(() => setApiError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (apiError) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.2)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--red)" }}>
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Backend not reachable</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Make sure the FastAPI server is running on port 8000.</p>
    </div>
  );

  const rawName  = session?.user?.name
    ? session.user.name.split(" ")[0]
    : (session?.user?.email?.split("@")[0] ?? "there")
        .replace(/[^a-zA-Z]/g, " ").trim().split(" ").find(p => p.length > 0) ?? "there";
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

  const recent   = [...jobs].sort((a, b) => b.id - a.id).slice(0, 5);
  const total    = stats?.total_jobs ?? 0;
  const applied  = stats?.applied_count ?? 0;
  const interviewing = stats?.interview_count ?? 0;
  const responseRate = applied > 0 ? Math.round((interviewing / applied) * 100) : 0;

  const kpiValues: Record<string, number> = { total, applied, interviewing, response: responseRate };

  return (
    <div className="max-w-6xl">

      {/* Hero banner */}
      <div
        className="relative overflow-hidden rounded-2xl mb-6 dot-grid"
        style={{
          background: "linear-gradient(135deg, #0F2027 0%, #1A3A4A 50%, #0A1628 100%)",
          minHeight: "160px",
          padding: "32px 40px",
        }}
      >
        {/* Radial glow — top-right */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 80% 50%, rgba(45,212,191,0.12) 0%, transparent 60%)" }}
        />
        <div className="relative flex items-start justify-between gap-6">
          {/* Left: text */}
          <div>
            <p
              className="font-semibold uppercase mb-2"
              style={{ color: "var(--accent)", fontSize: "11px", letterSpacing: "3px" }}
            >
              Overview
            </p>
            <h1
              className="font-bold font-heading mb-1"
              style={{ color: "#FFFFFF", fontSize: "32px", lineHeight: "1.2", letterSpacing: "-0.5px" }}
            >
              Hey {firstName} 👋
            </h1>
            <p className="text-sm" style={{ color: "#94A3B8" }}>
              {total === 0
                ? "No jobs tracked yet — scan to get started."
                : `You're tracking ${total} job${total !== 1 ? "s" : ""}. Keep the momentum going.`}
            </p>
          </div>
          {/* Right: buttons */}
          <div className="flex items-center gap-3 shrink-0 mt-1">
            <Link href="/scan" className="btn-primary text-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Scan Jobs
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-medium transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", color: "#F1F5F9", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              View All
            </Link>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(({ key, label, accent, suffix, icon }) => (
          <div
            key={key}
            className="relative p-5 rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", borderLeft: `3px solid ${accent}` }}
          >
            {/* Faint icon bg */}
            <div
              className="absolute top-3 right-3 pointer-events-none"
              style={{ color: accent, opacity: 0.12 }}
            >
              {icon}
            </div>
            <p
              className="text-3xl font-bold tracking-tight font-heading"
              style={{ color: "var(--text-primary)" }}
            >
              {kpiValues[key]}{suffix ?? ""}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent jobs */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--bg-border)" }}>
            <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--text-primary)" }}>Recent Jobs</h2>
            <Link
              href="/jobs"
              className="text-xs font-medium transition-colors"
              style={{ color: "var(--accent)" }}
            >
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No jobs yet.</p>
              <Link href="/scan" className="mt-3 inline-block btn-primary text-xs">Scan now</Link>
            </div>
          ) : (
            <div>
              {recent.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-6 py-3.5 transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid var(--bg-border)" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = ""; }}
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-medium text-sm truncate block transition-colors"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {job.title}
                    </Link>
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {job.company} · {job.date_added}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <FitScore score={job.fit_score} />
                    <StatusBadge status={job.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next best actions */}
        <div className="rounded-2xl p-5 flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
          <h2 className="text-sm font-semibold font-heading mb-4" style={{ color: "var(--text-primary)" }}>Next Best Actions</h2>
          <div className="space-y-1.5 flex-1">
            {nextActions.map(({ label, href, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-start gap-3 p-3 rounded-lg transition-colors group"
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "var(--bg-elevated)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = ""; }}
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                  style={{ color: "var(--accent)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--bg-border)" }}>
            <Link
              href="/coach"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ background: "linear-gradient(135deg, var(--accent-dim), var(--accent))", color: "#050C10" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Ask your AI Coach
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
