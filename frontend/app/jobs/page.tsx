"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { searchJobs, deleteJob, analyzeJob, Job } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import FitScore from "@/components/FitScore";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

const STATUSES = ["All", "Saved", "Applied", "Interviewing", "Offer", "Rejected"];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("All");
  const [fitScores, setFitScores] = useState<Record<number, number>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    searchJobs(keyword, status === "All" ? "" : status)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [keyword, status]);

  useEffect(() => { load(); }, [load]);

  const handleAnalyzeAll = async () => {
    const unscored = jobs.filter((j) => fitScores[j.id] == null);
    if (unscored.length === 0) return;
    setAnalyzing(true);
    for (let i = 0; i < unscored.length; i++) {
      setAnalyzeProgress(`Analyzing ${i + 1} / ${unscored.length}`);
      try {
        const analysis = await analyzeJob(unscored[i].id);
        setFitScores((prev) => ({ ...prev, [unscored[i].id]: analysis.fit_score }));
      } catch { /* skip failed */ }
    }
    setAnalyzing(false);
    setAnalyzeProgress("Done");
    setTimeout(() => setAnalyzeProgress(""), 2000);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this job?")) return;
    await deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  return (
    <div className="max-w-6xl">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Jobs</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {jobs.length > 0 ? `${jobs.length} job${jobs.length !== 1 ? "s" : ""} tracked` : "No jobs yet"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {analyzeProgress && (
            <span className="text-xs text-ink-muted">{analyzeProgress}</span>
          )}
          <button
            onClick={handleAnalyzeAll}
            disabled={analyzing || jobs.length === 0}
            title={jobs.length === 0 ? "Add jobs first to run AI analysis" : "Run AI fit analysis on all unscored jobs"}
            className="btn-ghost text-sm"
          >
            {analyzing ? analyzeProgress : "Analyze All"}
          </button>
          <Link href="/scan" className="btn-primary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Scan New
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search jobs..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="input pl-8"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                status === s
                  ? "bg-accent-600 text-white"
                  : "bg-elevated text-ink-secondary hover:text-ink hover:bg-border"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSpinner />
      ) : jobs.length === 0 ? (
        <EmptyState
          message="No jobs found"
          description="Try adjusting your filters or scan for new roles."
          action={<Link href="/scan" className="btn-primary text-sm">Scan for jobs</Link>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-base">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Title</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Company</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-ink-muted uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-ink-muted uppercase tracking-wider hidden lg:table-cell">Fit</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-ink-muted uppercase tracking-wider hidden lg:table-cell">Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-base transition-colors group">
                  <td className="px-5 py-3.5">
                    <Link href={`/jobs/${job.id}`} className="font-medium text-ink hover:text-accent-600 transition-colors">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink-secondary text-sm">{job.company}</td>
                  <td className="px-5 py-3.5 text-ink-muted text-sm hidden md:table-cell">{job.location || "—"}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={job.status} /></td>
                  <td className="px-5 py-3.5 hidden lg:table-cell"><FitScore score={fitScores[job.id] ?? null} /></td>
                  <td className="px-5 py-3.5 text-ink-muted text-xs hidden lg:table-cell">{job.date_added}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/jobs/${job.id}`} className="btn-ghost text-xs py-1 px-2.5">View</Link>
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="text-xs px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
