"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJob, fetchAnalysis, analyzeJob, updateJob, deleteJob, Job, JobAnalysis } from "@/lib/api";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import FitScore from "@/components/FitScore";
import LoadingSpinner from "@/components/LoadingSpinner";

const STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"];

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchJob(jobId),
      fetchAnalysis(jobId).catch(() => null),
    ]).then(([j, a]) => {
      setJob(j);
      setAnalysis(a);
    }).finally(() => setLoading(false));
  }, [jobId]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const result = await analyzeJob(jobId);
      setAnalysis(result);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!job) return;
    const updated = await updateJob(jobId, { status: newStatus });
    setJob(updated);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this job?")) return;
    await deleteJob(jobId);
    router.push("/jobs");
  };

  if (loading) return <LoadingSpinner />;
  if (!job) return <p className="text-[#a3a3a3]">Job not found.</p>;

  return (
    <div>
      <Header
        title={job.title}
        actions={
          <button
            onClick={handleDelete}
            className="text-sm bg-[#991b1b]/20 hover:bg-[#991b1b]/40 text-red-400 px-4 py-2 rounded transition-colors"
          >
            Delete
          </button>
        }
      />

      {/* Job info card */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Company</p>
            <p className="text-white">{job.company}</p>
          </div>
          <div>
            <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Location</p>
            <p className="text-white">{job.location || "—"}</p>
          </div>
          <div>
            <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">URL</p>
            {job.url ? (
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate block">
                {job.url}
              </a>
            ) : (
              <p className="text-[#a3a3a3]">—</p>
            )}
          </div>
          <div>
            <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Date Added</p>
            <p className="text-white">{job.date_added}</p>
          </div>
          <div>
            <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Status</p>
            <select
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="bg-[#1f1f1f] border border-[#2a2a2a] text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {job.notes && (
            <div className="col-span-2">
              <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Notes</p>
              <p className="text-[#a3a3a3]">{job.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Analysis panel */}
      <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-white">AI Analysis</h2>
          {!analyzing && (
            <button
              onClick={handleAnalyze}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
            >
              {analysis ? "Re-analyze" : "Analyze with AI"}
            </button>
          )}
        </div>

        {analyzing ? (
          <LoadingSpinner />
        ) : analysis ? (
          <div className="space-y-6 text-sm">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Fit Score</p>
                <FitScore score={analysis.fit_score} />
              </div>
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Verdict</p>
                <span className={`font-semibold ${
                  analysis.verdict === "APPLY" ? "text-green-400"
                  : analysis.verdict === "RED FLAG" ? "text-red-400"
                  : "text-yellow-400"
                }`}>{analysis.verdict}</span>
              </div>
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-1">Confidence</p>
                <span className="text-white">{analysis.confidence}%</span>
              </div>
            </div>

            {analysis.fit_reasons.length > 0 && (
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-2">Why It Fits</p>
                <ul className="space-y-1">
                  {analysis.fit_reasons.map((r, i) => (
                    <li key={i} className="text-[#a3a3a3] flex gap-2">
                      <span className="text-green-400">✓</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.skills_matched.length > 0 && (
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-2">Skills Matched</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.skills_matched.map((s, i) => (
                    <span key={i} className="bg-green-400/10 text-green-400 text-xs px-2 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {analysis.skill_gaps.length > 0 && (
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-2">Skill Gaps</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.skill_gaps.map((s, i) => (
                    <span key={i} className="bg-red-400/10 text-red-400 text-xs px-2 py-0.5 rounded">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {analysis.cover_letter && (
              <div>
                <p className="text-[#525252] text-xs uppercase tracking-wider mb-2">Cover Letter</p>
                <pre className="text-[#a3a3a3] whitespace-pre-wrap text-xs bg-[#1a1a1a] border border-[#1f1f1f] rounded p-4">
                  {analysis.cover_letter}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[#a3a3a3] text-sm">Not analyzed yet. Click "Analyze with AI" to get a fit score, skill gap analysis, and cover letter.</p>
        )}
      </div>
    </div>
  );
}
