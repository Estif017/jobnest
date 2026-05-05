"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJob, fetchAnalysis, analyzeJob, updateJob, deleteJob, fetchCompanyNews, agentAnalyzeJob, Job, JobAnalysis, CompanyNews, AgentAnalysis } from "@/lib/api";
import Header from "@/components/Header";
import FitScore from "@/components/FitScore";
import StatusBadge from "@/components/StatusBadge";
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
  const [news, setNews] = useState<CompanyNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentAnalysis | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJob(jobId),
      fetchAnalysis(jobId).catch(() => null),
    ]).then(([j, a]) => {
      setJob(j);
      setAnalysis(a);
      // Auto-fetch company news after job loads — no user action needed
      setNewsLoading(true);
      fetchCompanyNews(jobId)
        .then(setNews)
        .catch(() => setNews(null))
        .finally(() => setNewsLoading(false));
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

  const handleAgentAnalyze = async () => {
    setAgentLoading(true);
    setAgentError(null);
    try {
      const result = await agentAnalyzeJob(jobId);
      setAgentResult(result);
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Agent analyze failed.");
    } finally {
      setAgentLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!job) return <p className="text-ink-muted">Job not found.</p>;

  return (
    <div className="max-w-3xl">
      <Header
        title={job.title}
        subtitle={job.company}
        actions={
          <button
            onClick={handleDelete}
            className="text-sm px-4 py-2 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors"
          >
            Delete
          </button>
        }
      />

      {/* Job info card */}
      <div className="card p-6 mb-4">
        <div className="grid grid-cols-2 gap-5 text-sm">
          <div>
            <p className="label">Company</p>
            <p className="text-ink font-medium">{job.company}</p>
          </div>
          <div>
            <p className="label">Location</p>
            <p className="text-ink">{job.location || "—"}</p>
          </div>
          <div>
            <p className="label">Status</p>
            <select
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="input w-auto text-xs py-1.5"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="label">Date Added</p>
            <p className="text-ink-secondary">{job.date_added}</p>
          </div>
          {job.url && (
            <div className="col-span-2">
              <p className="label">URL</p>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-600 hover:underline text-sm truncate block"
              >
                {job.url}
              </a>
            </div>
          )}
          {job.notes && (
            <div className="col-span-2">
              <p className="label">Notes</p>
              <p className="text-ink-secondary">{job.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Company News — agentic web search panel                             */}
      {/* The backend automatically searched the web when you opened this     */}
      {/* page — no button click required.                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2.5 mb-3">
          {/* Globe icon — represents "eyes on the web" */}
          <div className="w-7 h-7 rounded-lg bg-ai-50 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ai-500">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Company Intelligence</p>
            <p className="text-[11px] text-ink-muted">Live web search · auto-generated</p>
          </div>
        </div>

        {newsLoading ? (
          <div className="flex items-center gap-2 py-3">
            <div className="w-4 h-4 border-2 border-border border-t-ai-500 rounded-full animate-spin shrink-0" />
            <p className="text-xs text-ink-muted">Searching the web for recent news about {job.company}…</p>
          </div>
        ) : news && news.bullets.length > 0 ? (
          <ul className="space-y-2.5">
            {news.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ai-400 shrink-0" />
                {bullet}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-muted py-1">No recent news found — TAVILY_API_KEY may not be set.</p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Agent Analyze — "Let the Agent Decide" panel                      */}
      {/* Claude receives the job info + a search_web tool and decides on   */}
      {/* its own whether and what to search. We log every tool call made.  */}
      {/* ------------------------------------------------------------------ */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-ai-50 flex items-center justify-center shrink-0">
              {/* Sparkle / agent icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ai-500">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Agent Analysis</p>
              <p className="text-[11px] text-ink-muted">Claude decides what to search · tool-use</p>
            </div>
          </div>
          {!agentLoading && (
            <button onClick={handleAgentAnalyze} className="text-xs px-3 py-1.5 rounded-xl bg-ai-50 text-ai-500 hover:bg-ai-100 font-medium transition-colors">
              {agentResult ? "Re-run Agent" : "Run Agent"}
            </button>
          )}
        </div>

        {agentLoading && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-border border-t-ai-500 rounded-full animate-spin shrink-0" />
              <p className="text-xs text-ink-muted">Claude is reasoning and searching the web…</p>
            </div>
          </div>
        )}

        {agentError && !agentLoading && (
          <p className="text-xs text-rose-600 py-1">{agentError}</p>
        )}

        {agentResult && !agentLoading && (
          <div className="space-y-4">
            {/* Tool calls Claude made — shows the agentic reasoning */}
            {agentResult.tool_calls.length > 0 && (
              <div>
                <p className="label mb-1.5">Searches Claude ran</p>
                <div className="space-y-1">
                  {agentResult.tool_calls.map((tc, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-ink-secondary">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ai-400 shrink-0">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <span className="font-mono bg-elevated border border-border px-2 py-0.5 rounded-md">{tc.query}</span>
                      <span className="text-ink-muted">{tc.results_count} result{tc.results_count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Final analysis from Claude */}
            <div>
              <p className="label mb-1.5">Analysis</p>
              <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">{agentResult.analysis}</p>
            </div>
          </div>
        )}

        {!agentResult && !agentLoading && !agentError && (
          <p className="text-xs text-ink-muted py-1">
            Click &quot;Run Agent&quot; — Claude will search the web on its own and return a contextual analysis.
          </p>
        )}
      </div>

      {/* AI Analysis panel */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-600">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
            </div>
            <p className="text-sm font-semibold text-ink">AI Analysis</p>
          </div>
          {!analyzing && (
            <button onClick={handleAnalyze} className="btn-primary text-xs py-1.5 px-3">
              {analysis ? "Re-analyze" : "Analyze with AI"}
            </button>
          )}
        </div>

        {analyzing ? (
          <LoadingSpinner />
        ) : analysis ? (
          <div className="space-y-5 text-sm">
            {/* Score row */}
            <div className="flex items-center gap-6 p-4 rounded-xl bg-base">
              <div>
                <p className="label">Fit Score</p>
                <FitScore score={analysis.fit_score} size="md" />
              </div>
              <div>
                <p className="label">Verdict</p>
                <span className={`font-semibold text-sm ${
                  analysis.verdict === "APPLY"    ? "text-emerald-600"
                  : analysis.verdict === "RED FLAG" ? "text-rose-600"
                  : "text-amber-600"
                }`}>{analysis.verdict}</span>
              </div>
              <div>
                <p className="label">Confidence</p>
                <span className="text-ink font-medium">{analysis.confidence}%</span>
              </div>
              <div className="ml-auto">
                <StatusBadge status={job.status} />
              </div>
            </div>

            {analysis.fit_reasons.length > 0 && (
              <div>
                <p className="label">Why It Fits</p>
                <ul className="space-y-1.5">
                  {analysis.fit_reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-ink-secondary text-sm">
                      <span className="text-emerald-500 mt-0.5">✓</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.skills_matched.length > 0 && (
              <div>
                <p className="label">Skills Matched</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.skills_matched.map((s, i) => (
                    <span key={i} className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {analysis.skill_gaps.length > 0 && (
              <div>
                <p className="label">Skill Gaps</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.skill_gaps.map((s, i) => (
                    <span key={i} className="bg-rose-50 text-rose-700 text-xs px-2.5 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {analysis.cover_letter && (
              <div>
                <p className="label">Cover Letter</p>
                <pre className="text-ink-secondary whitespace-pre-wrap text-xs bg-base border border-border rounded-xl p-4 leading-relaxed">
                  {analysis.cover_letter}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <p className="text-ink-muted text-sm">
            Not analyzed yet. Click &quot;Analyze with AI&quot; to get a fit score, skill gaps, and cover letter.
          </p>
        )}
      </div>
    </div>
  );
}
