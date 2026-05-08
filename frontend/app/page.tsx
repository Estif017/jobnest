"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { fetchDashboardStats, fetchJobs, DashboardStats, Job } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import FitScore from "@/components/FitScore";
import LoadingSpinner from "@/components/LoadingSpinner";

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
}

function KpiCard({ label, value, icon, accent = "bg-accent-50 text-accent-600" }: KpiCardProps) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-ink">{value}</p>
        <p className="text-xs text-ink-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const nextActions = [
  { label: "Scan for new jobs", href: "/scan", desc: "Find and score matching roles" },
  { label: "Review your top matches", href: "/jobs", desc: "See fit scores across saved jobs" },
  { label: "Talk to your coach", href: "/coach", desc: "Get interview prep or advice" },
];

export default function Dashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
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
      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p className="font-medium text-ink text-sm">Backend not reachable</p>
      <p className="text-ink-muted text-xs">Make sure the FastAPI server is running on port 8000.</p>
    </div>
  );

  const rawName = session?.user?.name
    ? session.user.name.split(" ")[0]
    : (session?.user?.email?.split("@")[0] ?? "there")
        .replace(/[^a-zA-Z]/g, " ").trim().split(" ").find((p) => p.length > 0) ?? "there";
  const firstName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
  const recent = [...jobs].sort((a, b) => b.id - a.id).slice(0, 5);

  const applied = stats?.applied_count ?? 0;
  const total = stats?.total_jobs ?? 0;
  const responseRate = applied > 0 ? Math.round(((stats?.interview_count ?? 0) / applied) * 100) : 0;

  return (
    <div className="max-w-6xl">
      {/* Hero summary */}
      <div className="card p-6 mb-6 bg-gradient-to-br from-accent-50 to-white border-accent-100">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-accent-600 uppercase tracking-widest mb-1">Overview</p>
            <h1 className="text-2xl font-bold text-ink tracking-tight">{`Hey ${firstName}, here's where your search stands`}</h1>
            <p className="text-ink-secondary text-sm mt-1">
              {total === 0
                ? "No jobs tracked yet — scan to get started."
                : `You're tracking ${total} job${total !== 1 ? "s" : ""}. Keep the momentum going.`}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/scan" className="btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              Scan Jobs
            </Link>
            <Link href="/jobs" className="btn-ghost">
              View All
            </Link>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="Total Tracked"
          value={total}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>}
        />
        <KpiCard
          label="Applications Sent"
          value={applied}
          accent="bg-blue-50 text-blue-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/></svg>}
        />
        <KpiCard
          label="Interviewing"
          value={stats?.interview_count ?? 0}
          accent="bg-violet-50 text-violet-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
        />
        <KpiCard
          label="Response Rate"
          value={responseRate}
          accent="bg-emerald-50 text-emerald-600"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent jobs */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent Jobs</h2>
            <Link href="/jobs" className="text-xs text-accent-600 hover:text-accent-700 font-medium">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-ink-muted text-sm">No jobs yet.</p>
              <Link href="/scan" className="mt-3 inline-block btn-primary text-xs">Scan now</Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((job) => (
                <div key={job.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-base transition-colors">
                  <div className="flex-1 min-w-0">
                    <Link href={`/jobs/${job.id}`} className="font-medium text-sm text-ink hover:text-accent-600 transition-colors truncate block">
                      {job.title}
                    </Link>
                    <p className="text-xs text-ink-muted truncate">{job.company} · {job.date_added}</p>
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
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-ink mb-4">Next Best Actions</h2>
          <div className="space-y-2">
            {nextActions.map(({ label, href, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-start gap-3 p-3 rounded-xl hover:bg-base transition-colors group"
              >
                <div className="w-6 h-6 rounded-lg bg-accent-50 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-accent-100 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-600">
                    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink group-hover:text-accent-700 transition-colors">{label}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <Link
              href="/coach"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ai-50 text-ai-600 text-sm font-medium hover:bg-ai-100 transition-colors"
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
