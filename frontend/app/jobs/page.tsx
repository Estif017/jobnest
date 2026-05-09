"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { searchJobs, deleteJob, analyzeJob, exportJobsCsv, importJobFromUrl, createJob, updateJob, Job, JobImport } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import FitScore from "@/components/FitScore";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";
import ConfirmButton from "@/components/ConfirmButton";

const STATUSES = ["All", "Saved", "Applied", "Interviewing", "Offer", "Rejected"];

const KANBAN_COLS = [
  { status: "Saved",        color: "var(--blue)" },
  { status: "Applied",      color: "var(--accent)" },
  { status: "Interviewing", color: "var(--yellow)" },
  { status: "Offer",        color: "var(--green)" },
  { status: "Rejected",     color: "var(--red)" },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("All");
  const [fitScores, setFitScores] = useState<Record<number, number>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [dragJobId, setDragJobId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [overdueJobs, setOverdueJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<JobImport | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "fit" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const PAGE_SIZE = 25;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((kw: string, st: string) => {
    setLoading(true);
    setPage(0);
    searchJobs(kw, st === "All" ? "" : st)
      .then((result) => {
        setJobs(result);
        const preloaded: Record<number, number> = {};
        result.forEach((j) => { if (j.fit_score != null) preloaded[j.id] = j.fit_score; });
        setFitScores(preloaded);
        if (kw === "" && (st === "All" || st === "")) {
          const today = new Date().toISOString().split("T")[0];
          setOverdueJobs(result.filter(
            (j) => j.follow_up_date && j.follow_up_date < today &&
                   j.status !== "Offer" && j.status !== "Rejected"
          ));
        }
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(keyword, status), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [keyword, status, load]);

  const handleAnalyzeAll = async () => {
    const unscored = jobs.filter((j) => fitScores[j.id] == null);
    if (unscored.length === 0) return;
    if (unscored.length > 5) {
      const ok = window.confirm(`This will run AI analysis on ${unscored.length} jobs (uses API credits). Continue?`);
      if (!ok) return;
    }
    setAnalyzing(true);
    let done = 0;
    const CONCURRENCY = 4;
    const runBatch = async (batch: typeof unscored) => {
      await Promise.allSettled(
        batch.map(async (job) => {
          try {
            const analysis = await analyzeJob(job.id);
            setFitScores((prev) => ({ ...prev, [job.id]: analysis.fit_score }));
          } catch { /* skip failed */ }
          done++;
          setAnalyzeProgress(`Analyzed ${done} / ${unscored.length}`);
        })
      );
    };
    for (let i = 0; i < unscored.length; i += CONCURRENCY) {
      await runBatch(unscored.slice(i, i + CONCURRENCY));
    }
    setAnalyzing(false);
    setAnalyzeProgress("Done");
    setTimeout(() => setAnalyzeProgress(""), 2000);
  };

  const handleDelete = async (id: number) => {
    await deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleExportCsv = async () => {
    try { await exportJobsCsv(); } catch { /* silent */ }
  };

  const handleFetchUrl = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportError("");
    setImportPreview(null);
    try {
      const data = await importJobFromUrl(importUrl.trim());
      setImportPreview(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to import job.");
    } finally {
      setImportLoading(false);
    }
  };

  const handleSaveImport = async () => {
    if (!importPreview) return;
    setImportSaving(true);
    setImportError("");
    try {
      await createJob({
        title: importPreview.title || "Untitled Role",
        company: importPreview.company || "Unknown Company",
        location: importPreview.location,
        url: importPreview.url,
        notes: importPreview.description,
        status: "Saved",
      });
      setShowImport(false);
      setImportUrl("");
      setImportPreview(null);
      load(keyword, status);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Failed to save job.");
    } finally {
      setImportSaving(false);
    }
  };

  const closeImport = () => {
    setShowImport(false);
    setImportUrl("");
    setImportPreview(null);
    setImportError("");
  };

  const toggleSelect = (id: number) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });

  const toggleSelectAll = (pageJobIds: number[]) =>
    setSelected((prev) => pageJobIds.every((id) => prev.has(id)) ? new Set() : new Set(pageJobIds));

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} job(s)? This cannot be undone.`)) return;
    await Promise.allSettled(Array.from(selected).map((id) => deleteJob(id)));
    setJobs((prev) => prev.filter((j) => !selected.has(j.id)));
    setSelected(new Set());
  };

  const handleBulkStatus = async (newStatus: string) => {
    if (!newStatus) return;
    await Promise.allSettled(Array.from(selected).map((id) => updateJob(id, { status: newStatus })));
    setJobs((prev) => prev.map((j) => selected.has(j.id) ? { ...j, status: newStatus } : j));
    setSelected(new Set());
    setBulkStatus("");
  };

  const handleSort = (col: "date" | "fit") => {
    if (sortBy === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const sortedJobs = useMemo(() => {
    if (!sortBy) return jobs;
    return [...jobs].sort((a, b) => {
      if (sortBy === "date") {
        const cmp = a.date_added < b.date_added ? -1 : a.date_added > b.date_added ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      }
      const fa = fitScores[a.id] ?? null;
      const fb = fitScores[b.id] ?? null;
      if (fa === null && fb === null) return 0;
      if (fa === null) return 1;
      if (fb === null) return -1;
      const cmp = fa - fb;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [jobs, sortBy, sortDir, fitScores]);

  const handleDragStart = (jobId: number) => setDragJobId(jobId);

  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(col);
  };

  const handleDrop = async (e: React.DragEvent, col: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (dragJobId == null) return;
    const job = jobs.find((j) => j.id === dragJobId);
    if (!job || job.status === col) { setDragJobId(null); return; }
    setJobs((prev) => prev.map((j) => j.id === dragJobId ? { ...j, status: col } : j));
    try {
      await updateJob(dragJobId, { status: col });
    } catch {
      setJobs((prev) => prev.map((j) => j.id === dragJobId ? { ...j, status: job.status } : j));
    }
    setDragJobId(null);
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--text-primary)" }}>Jobs</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {jobs.length > 0 ? `${jobs.length} job${jobs.length !== 1 ? "s" : ""} tracked` : "No jobs yet"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {analyzeProgress && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{analyzeProgress}</span>
          )}
          <button
            onClick={handleAnalyzeAll}
            disabled={analyzing || jobs.length === 0}
            title={jobs.length === 0 ? "Add jobs first to run AI analysis" : "Run AI fit analysis on all unscored jobs"}
            className="btn-ghost text-sm"
          >
            {analyzing ? "Analyzing…" : "Analyze All"}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={jobs.length === 0}
            title="Download all jobs as CSV"
            className="btn-ghost text-sm"
          >
            Export CSV
          </button>
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--bg-border)" }}>
            <button
              onClick={() => setView("table")}
              title="Table view"
              className="px-2.5 py-1.5 transition-colors"
              style={view === "table" ? { background: "var(--accent)", color: "#050C10" } : { color: "var(--text-muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
            </button>
            <button
              onClick={() => { setStatus("All"); setView("kanban"); }}
              title="Kanban view"
              className="px-2.5 py-1.5 transition-colors"
              style={view === "kanban" ? { background: "var(--accent)", color: "#050C10" } : { color: "var(--text-muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/>
              </svg>
            </button>
          </div>
          <button
            onClick={() => { setShowImport((v) => !v); setImportPreview(null); setImportError(""); }}
            className="btn-ghost text-sm"
            title="Paste a job posting URL to auto-import"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Import URL
          </button>
          <Link href="/scan" className="btn-primary text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Scan New
          </Link>
        </div>
      </div>

      {/* Import URL panel */}
      {showImport && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Import job from URL</p>
            <button onClick={closeImport} style={{ color: "var(--text-muted)" }} className="text-lg leading-none">×</button>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="url"
              placeholder="https://jobs.example.com/posting/12345"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleFetchUrl(); }}
              className="input flex-1"
            />
            <button
              onClick={handleFetchUrl}
              disabled={importLoading || !importUrl.trim()}
              className="btn-primary text-sm shrink-0"
            >
              {importLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Fetching…
                </span>
              ) : "Fetch"}
            </button>
          </div>

          {importError && (
            <p className="text-sm mb-4" style={{ color: "var(--red)" }}>{importError}</p>
          )}

          {importPreview && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Preview — edit before saving</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Job title</label>
                  <input
                    className="input text-sm"
                    value={importPreview.title}
                    onChange={(e) => setImportPreview({ ...importPreview, title: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Company</label>
                  <input
                    className="input text-sm"
                    value={importPreview.company}
                    onChange={(e) => setImportPreview({ ...importPreview, company: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Location</label>
                  <input
                    className="input text-sm"
                    value={importPreview.location}
                    onChange={(e) => setImportPreview({ ...importPreview, location: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>URL</label>
                  <input
                    className="input text-sm"
                    value={importPreview.url}
                    onChange={(e) => setImportPreview({ ...importPreview, url: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Description (saved as notes)</label>
                <textarea
                  className="input text-sm resize-none"
                  rows={4}
                  value={importPreview.description}
                  onChange={(e) => setImportPreview({ ...importPreview, description: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleSaveImport}
                  disabled={importSaving}
                  className="btn-primary text-sm"
                >
                  {importSaving ? "Saving…" : "Add to Tracker"}
                </button>
                <button onClick={closeImport} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Follow-up reminders */}
      {overdueJobs.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)" }}
        >
          <div className="flex items-start gap-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: "var(--yellow)" }}>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--yellow)" }}>
                {overdueJobs.length} follow-up{overdueJobs.length !== 1 ? "s" : ""} overdue
              </p>
              <div className="flex flex-wrap gap-2">
                {overdueJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/jobs/${job.id}`}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors"
                    style={{ background: "rgba(251,191,36,0.1)", color: "var(--text-primary)", border: "1px solid rgba(251,191,36,0.2)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--yellow)"}
                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(251,191,36,0.2)"}
                  >
                    <span className="font-medium truncate max-w-[140px]">{job.title}</span>
                    <span style={{ color: "var(--text-muted)" }}>·</span>
                    <span style={{ color: "var(--text-muted)" }}>{job.follow_up_date}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-2xl mb-4 flex-wrap"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--accent)", boxShadow: "0 0 0 1px var(--accent-dim)" }}
        >
          <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <select
              value={bulkStatus}
              onChange={(e) => { setBulkStatus(e.target.value); handleBulkStatus(e.target.value); }}
              className="input text-xs py-1 pr-7"
              style={{ width: "auto" }}
            >
              <option value="">Move to status…</option>
              {STATUSES.filter((s) => s !== "All").map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleBulkDelete}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)", border: "1px solid rgba(248,113,113,0.2)" }}
            >
              Delete {selected.size}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="p-4 rounded-2xl flex flex-wrap gap-3 mb-6"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
      >
        <div className="relative flex-1 min-w-48">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          >
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
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={
                status === s
                  ? { background: "var(--accent)", color: "#050C10", fontWeight: 600 }
                  : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }
              }
              onMouseEnter={e => { if (status !== s) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { if (status !== s) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Sort controls — always visible; lg users also get clickable column headers */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>Sort:</span>
          {(["date", "fit"] as const).map((col) => (
            <button
              key={col}
              onClick={() => handleSort(col)}
              className="px-2.5 py-1 rounded-xl text-xs font-medium transition-colors"
              style={
                sortBy === col
                  ? { background: "var(--accent)", color: "#050C10" }
                  : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--bg-border)" }
              }
            >
              {col === "date" ? "Date" : "Fit"}{sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
            </button>
          ))}
          {sortBy && (
            <button onClick={() => setSortBy(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : jobs.length === 0 ? (
        <EmptyState
          message="No jobs found"
          description="Try adjusting your filters or scan for new roles."
          action={<Link href="/scan" className="btn-primary text-sm">Scan for jobs</Link>}
        />
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ minHeight: "60vh" }}>
          {KANBAN_COLS.map(({ status: col, color }) => {
            const colJobs = jobs.filter((j) => j.status === col);
            const isOver  = dragOverCol === col;
            return (
              <div
                key={col}
                className="flex-shrink-0 w-72 sm:w-64 rounded-2xl flex flex-col snap-start"
                style={{
                  background: "var(--bg-surface)",
                  border: `1px solid ${isOver ? color : "var(--bg-border)"}`,
                  transition: "border-color 0.15s",
                  minHeight: "200px",
                }}
                onDragOver={(e) => handleDragOver(e, col)}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, col)}
              >
                <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{col}</span>
                  <span className="ml-auto text-xs font-medium px-1.5 py-0.5 rounded-md" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                    {colJobs.length}
                  </span>
                </div>
                <div className={`p-2 space-y-2 flex-1 ${isOver ? "rounded-b-2xl" : ""}`} style={isOver ? { background: `color-mix(in srgb, ${color} 5%, transparent)` } : {}}>
                  {colJobs.map((job) => (
                    <div
                      key={job.id}
                      draggable
                      onDragStart={() => handleDragStart(job.id)}
                      onDragEnd={() => { setDragJobId(null); setDragOverCol(null); }}
                      className="rounded-xl p-3 group"
                      style={{
                        background: dragJobId === job.id ? "var(--bg-base)" : "var(--bg-elevated)",
                        border: "1px solid var(--bg-border)",
                        opacity: dragJobId === job.id ? 0.45 : 1,
                        cursor: "grab",
                        transition: "opacity 0.15s",
                      }}
                    >
                      <Link
                        href={`/jobs/${job.id}`}
                        className="block text-sm font-medium leading-snug mb-0.5 transition-colors"
                        style={{ color: "var(--text-primary)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"}
                        onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)"}
                      >
                        {job.title}
                      </Link>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{job.company}</p>
                      <div className="flex items-center justify-between mt-2">
                        <FitScore score={fitScores[job.id] ?? null} />
                        <ConfirmButton
                          onConfirm={() => handleDelete(job.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-0.5 rounded-md"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (() => {
        const totalPages = Math.ceil(sortedJobs.length / PAGE_SIZE);
        const pageJobs   = sortedJobs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        return (
          <>
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--bg-border)" }}>
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-teal-400"
                        checked={pageJobs.every((j) => selected.has(j.id))}
                        onChange={() => toggleSelectAll(pageJobs.map((j) => j.id))}
                      />
                    </th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Title</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Company</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: "var(--text-muted)" }}>Location</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Status</th>
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider hidden lg:table-cell cursor-pointer select-none"
                      style={{ color: sortBy === "fit" ? "var(--accent)" : "var(--text-muted)" }}
                      onClick={() => handleSort("fit")}
                      title="Sort by fit score"
                    >
                      Fit{sortBy === "fit" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider hidden lg:table-cell cursor-pointer select-none"
                      style={{ color: sortBy === "date" ? "var(--accent)" : "var(--text-muted)" }}
                      onClick={() => handleSort("date")}
                      title="Sort by date added"
                    >
                      Added{sortBy === "date" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pageJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="group transition-colors"
                      style={{ borderBottom: "1px solid var(--bg-border)", background: selected.has(job.id) ? "var(--bg-elevated)" : "" }}
                      onMouseEnter={e => { if (!selected.has(job.id)) (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={e => { if (!selected.has(job.id)) (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      <td className="px-4 py-3.5 w-8">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-teal-400"
                          checked={selected.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="font-medium text-sm transition-colors"
                          style={{ color: "var(--text-primary)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent)"}
                          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)"}
                        >
                          {job.title}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>{job.company}</td>
                      <td className="px-5 py-3.5 text-sm hidden md:table-cell" style={{ color: "var(--text-muted)" }}>{job.location || "—"}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={job.status} /></td>
                      <td className="px-5 py-3.5 hidden lg:table-cell"><FitScore score={fitScores[job.id] ?? null} /></td>
                      <td className="px-5 py-3.5 text-xs hidden lg:table-cell" style={{ color: "var(--text-muted)" }}>{job.date_added}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/jobs/${job.id}`} className="btn-ghost text-xs py-1 px-2.5">View</Link>
                          <ConfirmButton onConfirm={() => handleDelete(job.id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, jobs.length)} of {jobs.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="btn-ghost text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i).map((i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className="text-xs w-7 h-7 rounded-lg font-medium transition-colors"
                      style={
                        i === page
                          ? { background: "var(--accent)", color: "#050C10" }
                          : { color: "var(--text-secondary)" }
                      }
                      onMouseEnter={e => { if (i !== page) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={e => { if (i !== page) (e.currentTarget as HTMLButtonElement).style.background = ""; }}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page === totalPages - 1}
                    className="btn-ghost text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
