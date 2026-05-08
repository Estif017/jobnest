"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  fetchJob, fetchAnalysis, analyzeJob, updateJob, deleteJob,
  fetchCompanyNews, agentAnalyzeJob, agentProduceJob, fullHuntJob,
  fetchInterviewPrep, generateInterviewPrep,
  Job, JobAnalysis, CompanyNews, AgentAnalysis, AgentProduceResult, InterviewPrep,
  FullHuntResult,
} from "@/lib/api";
import Header from "@/components/Header";
import ConfirmButton from "@/components/ConfirmButton";
import FitScore from "@/components/FitScore";
import StatusBadge from "@/components/StatusBadge";
import LoadingSpinner from "@/components/LoadingSpinner";

const STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"];

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const jobId = Number(id);

  const [job, setJob]           = useState<Job | null>(null);
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading]   = useState(true);

  const [news, setNews]               = useState<CompanyNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);

  const [agentResult, setAgentResult] = useState<AgentAnalysis | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError]   = useState<string | null>(null);

  const [produceResult, setProduceResult] = useState<AgentProduceResult | null>(null);
  const [produceLoading, setProduceLoading] = useState(false);
  const [produceError, setProduceError]   = useState<string | null>(null);

  const [prep, setPrep]               = useState<InterviewPrep | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);

  const [huntResult, setHuntResult]   = useState<FullHuntResult | null>(null);
  const [huntLoading, setHuntLoading] = useState(false);
  const [huntError, setHuntError]     = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJob(jobId),
      fetchAnalysis(jobId).catch(() => null),
    ]).then(([j, a]) => {
      setJob(j);
      setAnalysis(a);
      setNewsLoading(true);
      fetchCompanyNews(jobId)
        .then(setNews)
        .catch(() => setNews(null))
        .finally(() => setNewsLoading(false));
      if (j.status === "Interviewing") {
        fetchInterviewPrep(jobId).then(setPrep).catch(() => {});
      }
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
    if (newStatus === "Interviewing" && !prep && !prepLoading) {
      setPrepLoading(true);
      fetchInterviewPrep(jobId)
        .then(setPrep)
        .catch(() => generateInterviewPrep(jobId).then(setPrep).catch(() => {}))
        .finally(() => setPrepLoading(false));
    }
  };

  const handleDelete = async () => {
    await deleteJob(jobId);
    router.push("/jobs");
  };

  const handleAgentAnalyze = async () => {
    setAgentLoading(true);
    setAgentError(null);
    try {
      setAgentResult(await agentAnalyzeJob(jobId));
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Agent analyze failed.");
    } finally {
      setAgentLoading(false);
    }
  };

  const handleAgentProduce = async () => {
    setProduceLoading(true);
    setProduceError(null);
    try {
      setProduceResult(await agentProduceJob(jobId));
    } catch (e) {
      setProduceError(e instanceof Error ? e.message : "Agent write failed.");
    } finally {
      setProduceLoading(false);
    }
  };

  const handleFullHunt = async () => {
    setHuntLoading(true);
    setHuntError(null);
    try {
      setHuntResult(await fullHuntJob(jobId));
    } catch (e) {
      setHuntError(e instanceof Error ? e.message : "Full Hunt failed.");
    } finally {
      setHuntLoading(false);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!job) return <p style={{ color: "var(--text-muted)" }}>Job not found.</p>;

  const isInterviewing = job.status === "Interviewing";

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs mb-4 transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>
      <Header
        title={job.title}
        subtitle={job.company}
        actions={
          <ConfirmButton
            onConfirm={handleDelete}
            className="text-sm px-4 py-2 rounded-xl transition-colors"
          />
        }
      />

      {/* Job info card */}
      <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
        <div className="grid grid-cols-2 gap-5 text-sm">
          <div>
            <p className="label">Company</p>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>{job.company}</p>
          </div>
          <div>
            <p className="label">Location</p>
            <p style={{ color: "var(--text-primary)" }}>{job.location || "—"}</p>
          </div>
          <div>
            <p className="label">Status</p>
            <select
              value={job.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="input w-auto text-xs py-1.5"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <p className="label">Date Added</p>
            <p style={{ color: "var(--text-secondary)" }}>{job.date_added}</p>
          </div>
          <div>
            <p className="label">Date Applied</p>
            <input
              type="date"
              value={job.date_applied ?? ""}
              onChange={(e) => updateJob(jobId, { date_applied: e.target.value || null }).then(setJob)}
              className="input text-xs py-1.5"
            />
          </div>
          <div>
            <p className="label">Follow-up Date</p>
            <input
              type="date"
              value={job.follow_up_date ?? ""}
              onChange={(e) => updateJob(jobId, { follow_up_date: e.target.value || null }).then(setJob)}
              className="input text-xs py-1.5"
            />
          </div>
          {job.url && (
            <div className="col-span-2">
              <p className="label">URL</p>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm truncate block transition-colors"
                style={{ color: "var(--accent)" }}
              >
                {job.url}
              </a>
            </div>
          )}
          {job.notes && (
            <div className="col-span-2">
              <p className="label">Notes</p>
              <p style={{ color: "var(--text-secondary)" }}>{job.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Full Hunt — gradient border card */}
      <div className="gradient-border-card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(45,212,191,0.1)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Full Hunt</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>One prompt · Claude orchestrates the entire pipeline</p>
            </div>
          </div>
          {!huntLoading && (
            <button
              onClick={handleFullHunt}
              className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
              style={{ background: "var(--accent)", color: "#050C10" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.12)"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.filter = ""}
            >
              {huntResult ? "Re-run Hunt" : "Help Me Land This Job"}
            </button>
          )}
        </div>

        {huntLoading && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
                style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Orchestrator running — Claude is deciding what to do…</p>
            </div>
            <div className="flex gap-1.5 ml-6">
              {["Analyzing fit", "Researching company", "Writing application"].map((step, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full animate-pulse"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-muted)", animationDelay: `${i * 400}ms` }}
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}

        {huntError && !huntLoading && (
          <p className="text-xs py-1" style={{ color: "var(--red)" }}>{huntError}</p>
        )}

        {huntResult && !huntLoading && (
          <div className="space-y-5">
            {/* Verdict row */}
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-4"
              style={
                huntResult.verdict === "RED FLAG"
                  ? { background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }
                  : huntResult.verdict === "APPLY"
                  ? { background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)" }
                  : { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }
              }
            >
              <span
                className="text-sm font-bold"
                style={{
                  color: huntResult.verdict === "RED FLAG" ? "var(--red)"
                    : huntResult.verdict === "APPLY" ? "var(--green)"
                    : "var(--yellow)",
                }}
              >
                {huntResult.verdict}
              </span>
              {huntResult.fit_score != null && (
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {huntResult.fit_score}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>/10</span>
                </span>
              )}
              {huntResult.tool_calls_log.length > 0 && (
                <div className="ml-auto flex items-center gap-1.5">
                  {huntResult.tool_calls_log.map((tc, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-md"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-muted)" }}
                    >
                      {tc.tool === "analyze_job" ? "analyze" : tc.tool === "write_application" ? "write" : "coach"}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {huntResult.orchestrator_summary && (
              <div>
                <p className="label mb-1.5">Orchestrator Summary</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{huntResult.orchestrator_summary}</p>
              </div>
            )}

            {huntResult.analysis && (
              <div className="grid grid-cols-2 gap-3">
                {huntResult.analysis.skills_matched.length > 0 && (
                  <div>
                    <p className="label mb-1.5">Skills Matched</p>
                    <div className="flex flex-wrap gap-1.5">
                      {huntResult.analysis.skills_matched.map((s, i) => (
                        <span key={i} className="text-xs px-2.5 py-0.5 rounded-full"
                          style={{ background: "rgba(52,211,153,0.1)", color: "var(--green)" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {huntResult.analysis.skill_gaps.length > 0 && (
                  <div>
                    <p className="label mb-1.5">Skill Gaps</p>
                    <div className="flex flex-wrap gap-1.5">
                      {huntResult.analysis.skill_gaps.map((s, i) => (
                        <span key={i} className="text-xs px-2.5 py-0.5 rounded-full"
                          style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {huntResult.resume_summary && (
              <div>
                <p className="label mb-1.5">Tailored Resume Summary</p>
                <p className="text-sm leading-relaxed px-4 py-3 rounded-xl"
                  style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                  {huntResult.resume_summary}
                </p>
              </div>
            )}

            {huntResult.cover_letter && (
              <div>
                <p className="label mb-1.5">Cover Letter</p>
                <pre className="text-sm whitespace-pre-wrap leading-relaxed px-4 py-4 rounded-xl font-sans"
                  style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                  {huntResult.cover_letter}
                </pre>
              </div>
            )}

            {huntResult.coach_advice && (
              <div className="px-4 py-3.5 rounded-xl"
                style={{ background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.15)" }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--accent)" }}>Coach Advice</p>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{huntResult.coach_advice}</p>
              </div>
            )}
          </div>
        )}

        {!huntResult && !huntLoading && !huntError && (
          <p className="text-xs py-1" style={{ color: "var(--text-muted)" }}>
            Click &ldquo;Help Me Land This Job&rdquo; — Claude will analyze fit, write your application, and coach you on gaps. All in one shot.
          </p>
        )}
      </div>

      {/* Interview Prep Pack */}
      {(isInterviewing || prepLoading) && (
        <div
          className="rounded-2xl p-6 mb-4"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", borderLeft: "3px solid var(--yellow)" }}
        >
          <div className="flex items-center gap-2.5 mb-5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(251,191,36,0.1)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--yellow)" }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Interview Prep Pack</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {prepLoading ? "Generating…" : "Auto-generated when you moved to Interviewing"}
              </p>
            </div>
          </div>

          {prepLoading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
                  style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--yellow)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Claude is reading your resume and generating a prep pack for {job.company}…
                </p>
              </div>
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 rounded animate-pulse w-2/3" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-3 rounded animate-pulse w-full" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-3 rounded animate-pulse w-4/5" style={{ background: "var(--bg-elevated)" }} />
                </div>
              ))}
            </div>
          )}

          {prep && !prepLoading && (
            <div className="space-y-6">
              <div>
                <p className="label mb-3">Likely Interview Questions</p>
                <div className="space-y-4">
                  {prep.questions.map((q, i) => (
                    <div key={i} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
                      <div className="flex items-start gap-2.5 px-4 py-2.5" style={{ background: "var(--bg-elevated)" }}>
                        <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: "var(--yellow)" }}>Q{i + 1}</span>
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{q.question}</p>
                      </div>
                      <div className="px-4 py-3" style={{ background: "var(--bg-surface)" }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Suggested answer</p>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{q.answer}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {prep.research.length > 0 && (
                <div>
                  <p className="label mb-2">Research Before the Interview</p>
                  <ul className="space-y-2">
                    {prep.research.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          className="shrink-0 mt-0.5" style={{ color: "var(--yellow)" }}>
                          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {prep.smart_question && (
                <div className="px-4 py-3.5 rounded-xl"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "var(--yellow)" }}>Smart question to ask the interviewer</p>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>&ldquo;{prep.smart_question}&rdquo;</p>
                </div>
              )}
            </div>
          )}

          {!prep && !prepLoading && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Prep pack will appear here once generated.</p>
          )}
        </div>
      )}

      {/* Company Intelligence */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(45,212,191,0.1)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Company Intelligence</p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Live web search · auto-generated</p>
          </div>
        </div>

        {newsLoading ? (
          <div className="flex items-center gap-2 py-3">
            <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
              style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }} />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Searching the web for recent news about {job.company}…</p>
          </div>
        ) : news && news.bullets.length > 0 ? (
          <ul className="space-y-2.5">
            {news.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--text-secondary)" }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
                {bullet}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs py-1" style={{ color: "var(--text-muted)" }}>
            No recent news found — TAVILY_API_KEY may not be set.
          </p>
        )}
      </div>

      {/* AI Tools — tabbed panel */}
      {(() => {
        const tabs = [
          { id: "fit"    as const, label: "Fit Analysis" },
          { id: "search" as const, label: "Agent Search" },
          { id: "write"  as const, label: "Write for Me" },
        ];
        return (
          <AiToolsPanel
            job={job}
            tabs={tabs}
            analysis={analysis} analyzing={analyzing} handleAnalyze={handleAnalyze}
            agentResult={agentResult} agentLoading={agentLoading} agentError={agentError} handleAgentAnalyze={handleAgentAnalyze}
            produceResult={produceResult} produceLoading={produceLoading} produceError={produceError} handleAgentProduce={handleAgentProduce}
          />
        );
      })()}
    </div>
  );
}

function AiToolsPanel({ job, analysis, analyzing, handleAnalyze, agentResult, agentLoading, agentError, handleAgentAnalyze, produceResult, produceLoading, produceError, handleAgentProduce }: {
  job: import("@/lib/api").Job;
  tabs: readonly { id: "fit" | "search" | "write"; label: string }[];
  analysis: import("@/lib/api").JobAnalysis | null; analyzing: boolean; handleAnalyze: () => void;
  agentResult: import("@/lib/api").AgentAnalysis | null; agentLoading: boolean; agentError: string | null; handleAgentAnalyze: () => void;
  produceResult: import("@/lib/api").AgentProduceResult | null; produceLoading: boolean; produceError: string | null; handleAgentProduce: () => void;
}) {
  const [tab, setTab] = useState<"fit" | "search" | "write">("fit");

  const tabs = [
    { id: "fit"    as const, label: "Fit Analysis" },
    { id: "search" as const, label: "Agent Search" },
    { id: "write"  as const, label: "Write for Me" },
  ];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
      {/* Tab bar */}
      <div className="flex px-1 pt-1" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--bg-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-xs font-medium rounded-t-lg transition-colors"
            style={
              tab === t.id
                ? { background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--bg-border)", borderBottom: "1px solid var(--bg-surface)", marginBottom: "-1px" }
                : { color: "var(--text-muted)" }
            }
            onMouseEnter={e => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* Fit Analysis */}
        {tab === "fit" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Quick fit score · no web search</p>
              {!analyzing && (
                <button onClick={handleAnalyze} className="btn-primary text-xs py-1.5 px-3">
                  {analysis ? "Re-analyze" : "Analyze"}
                </button>
              )}
            </div>
            {analyzing ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
                  style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Scoring your fit…</p>
              </div>
            ) : analysis ? (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-6 p-4 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
                  <div>
                    <p className="label">Fit Score</p>
                    <FitScore score={analysis.fit_score} size="md" />
                  </div>
                  <div>
                    <p className="label">Verdict</p>
                    <span className="font-semibold" style={{
                      color: analysis.verdict === "APPLY" ? "var(--green)"
                        : analysis.verdict === "RED FLAG" ? "var(--red)"
                        : "var(--yellow)"
                    }}>
                      {analysis.verdict}
                    </span>
                  </div>
                  <div>
                    <p className="label">Confidence</p>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{analysis.confidence}%</span>
                  </div>
                  <div className="ml-auto"><StatusBadge status={job.status} /></div>
                </div>
                {analysis.fit_reasons.length > 0 && (
                  <div>
                    <p className="label">Why It Fits</p>
                    <ul className="space-y-1.5 mt-1.5">
                      {analysis.fit_reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
                          <span className="mt-0.5" style={{ color: "var(--green)" }}>✓</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {analysis.skills_matched.length > 0 && (
                    <div>
                      <p className="label mb-1.5">Skills Matched</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.skills_matched.map((s, i) => (
                          <span key={i} className="text-xs px-2.5 py-0.5 rounded-full"
                            style={{ background: "rgba(52,211,153,0.1)", color: "var(--green)" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.skill_gaps.length > 0 && (
                    <div>
                      <p className="label mb-1.5">Skill Gaps</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.skill_gaps.map((s, i) => (
                          <span key={i} className="text-xs px-2.5 py-0.5 rounded-full"
                            style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {analysis.cover_letter && (
                  <div>
                    <p className="label mb-1.5">Cover Letter</p>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed p-4 rounded-xl font-sans"
                      style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                      {analysis.cover_letter}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm py-2" style={{ color: "var(--text-muted)" }}>
                Click &quot;Analyze&quot; to get a fit score, skill gaps, and cover letter based on your resume.
              </p>
            )}
          </div>
        )}

        {/* Agent Search */}
        {tab === "search" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Claude searches the web autonomously and returns a contextual analysis</p>
              {!agentLoading && (
                <button
                  onClick={handleAgentAnalyze}
                  className="text-xs px-3 py-1.5 rounded-xl font-medium transition-colors"
                  style={{ background: "rgba(45,212,191,0.1)", color: "var(--accent)", border: "1px solid rgba(45,212,191,0.2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(45,212,191,0.18)"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(45,212,191,0.1)"}
                >
                  {agentResult ? "Re-run" : "Run Agent"}
                </button>
              )}
            </div>
            {agentLoading && (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
                  style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Claude is reasoning and searching the web…</p>
              </div>
            )}
            {agentError && !agentLoading && (
              <p className="text-xs py-1" style={{ color: "var(--red)" }}>{agentError}</p>
            )}
            {agentResult && !agentLoading && (
              <div className="space-y-4">
                {agentResult.tool_calls.length > 0 && (
                  <div>
                    <p className="label mb-1.5">Searches Claude ran</p>
                    <div className="space-y-1">
                      {agentResult.tool_calls.map((tc, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                            className="shrink-0" style={{ color: "var(--accent)" }}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          <span className="font-mono px-2 py-0.5 rounded-md"
                            style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                            {tc.query}
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>{tc.results_count} result{tc.results_count !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="label mb-1.5">Analysis</p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-secondary)" }}>{agentResult.analysis}</p>
                </div>
              </div>
            )}
            {!agentResult && !agentLoading && !agentError && (
              <p className="text-sm py-2" style={{ color: "var(--text-muted)" }}>
                Claude will decide what to search, run queries autonomously, and return a research-backed analysis.
              </p>
            )}
          </div>
        )}

        {/* Write for Me */}
        {tab === "write" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Reads your resume + researches {job.company} · writes tailored application materials</p>
              {!produceLoading && (
                <button
                  onClick={handleAgentProduce}
                  className="text-xs px-3 py-1.5 rounded-xl font-medium transition-colors"
                  style={{ background: "rgba(45,212,191,0.1)", color: "var(--accent)", border: "1px solid rgba(45,212,191,0.2)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(45,212,191,0.18)"}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "rgba(45,212,191,0.1)"}
                >
                  {produceResult ? "Re-write" : "Write for Me"}
                </button>
              )}
            </div>
            {produceLoading && (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 rounded-full animate-spin shrink-0"
                  style={{ borderColor: "var(--bg-border)", borderTopColor: "var(--accent)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Claude is reading your profile and researching {job.company}…</p>
              </div>
            )}
            {produceError && !produceLoading && (
              <p className="text-xs py-1" style={{ color: "var(--red)" }}>{produceError}</p>
            )}
            {produceResult && !produceLoading && (
              <div className="space-y-5">
                {produceResult.tool_calls.length > 0 && (
                  <div>
                    <p className="label mb-1.5">What Claude did</p>
                    <div className="space-y-1.5">
                      {produceResult.tool_calls.map((tc: import("@/lib/api").AgentToolCall, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                          {tc.tool === "get_candidate_profile" ? (
                            <>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                className="shrink-0" style={{ color: "var(--accent)" }}>
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                              </svg>
                              <span className="font-mono px-2 py-0.5 rounded-md"
                                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                                get_candidate_profile()
                              </span>
                              <span style={{ color: "var(--text-muted)" }}>Read your resume</span>
                            </>
                          ) : (
                            <>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                className="shrink-0" style={{ color: "var(--accent)" }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                              </svg>
                              <span className="font-mono px-2 py-0.5 rounded-md"
                                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                                {tc.query}
                              </span>
                              <span style={{ color: "var(--text-muted)" }}>{tc.results_count} result{tc.results_count !== 1 ? "s" : ""}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {produceResult.resume_summary && (
                  <div>
                    <p className="label mb-1.5">Tailored Resume Summary</p>
                    <p className="text-sm leading-relaxed px-4 py-3 rounded-xl"
                      style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                      {produceResult.resume_summary}
                    </p>
                  </div>
                )}
                {produceResult.cover_letter && (
                  <div>
                    <p className="label mb-1.5">Cover Letter</p>
                    <pre className="text-sm whitespace-pre-wrap leading-relaxed px-4 py-4 rounded-xl font-sans"
                      style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
                      {produceResult.cover_letter}
                    </pre>
                  </div>
                )}
              </div>
            )}
            {!produceResult && !produceLoading && !produceError && (
              <p className="text-sm py-2" style={{ color: "var(--text-muted)" }}>
                Claude reads your resume, researches {job.company}, then writes a tailored resume summary and 3-paragraph cover letter.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
