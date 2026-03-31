"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchDashboardStats, fetchJobs, DashboardStats, Job } from "@/lib/api";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import FitScore from "@/components/FitScore";
import LoadingSpinner from "@/components/LoadingSpinner";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-5">
      <p className="text-[#a3a3a3] text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchDashboardStats(), fetchJobs()])
      .then(([s, j]) => {
        setStats(s);
        setJobs(j);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const recent = [...jobs].sort((a, b) => b.id - a.id).slice(0, 5);

  return (
    <div>
      <Header
        title="Dashboard"
        actions={
          <>
            <Link
              href="/scan"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
            >
              Scan New Jobs
            </Link>
            <Link
              href="/jobs"
              className="text-sm bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white px-4 py-2 rounded transition-colors"
            >
              View All Jobs
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard label="Total Jobs" value={stats?.total_jobs ?? 0} />
        <StatCard label="Applied" value={stats?.applied_count ?? 0} />
        <StatCard label="Interviewing" value={stats?.interview_count ?? 0} />
        <StatCard label="Saved" value={stats?.top_statuses?.Saved ?? 0} />
      </div>

      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#1f1f1f]">
          <h2 className="text-sm font-semibold text-white">Recent Jobs</h2>
        </div>
        {recent.length === 0 ? (
          <p className="text-[#a3a3a3] text-sm px-6 py-8">No jobs tracked yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#525252] text-xs uppercase tracking-wider border-b border-[#1f1f1f]">
                <th className="text-left px-6 py-3">Title</th>
                <th className="text-left px-6 py-3">Company</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Fit Score</th>
                <th className="text-left px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#1a1a1a] transition-colors"
                >
                  <td className="px-6 py-3">
                    <Link href={`/jobs/${job.id}`} className="text-white hover:text-blue-400 transition-colors">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-[#a3a3a3]">{job.company}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-6 py-3">
                    <FitScore score={null} />
                  </td>
                  <td className="px-6 py-3 text-[#a3a3a3]">{job.date_added}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
