"use client";

import { useState, useEffect, useCallback } from "react";
import { scrapeJobs, ScoredJob } from "@/lib/api";
import JobCard from "@/components/JobCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

const CACHE_KEY   = "scan_results_cache";
const HISTORY_KEY = "scan_history";

const EXPERIENCE_LEVELS = [
  { value: "",          label: "Any Level"   },
  { value: "intern",    label: "Intern"      },
  { value: "junior",    label: "Junior"      },
  { value: "mid",       label: "Mid-Level"   },
  { value: "senior",    label: "Senior"      },
  { value: "lead",      label: "Lead / Staff"},
  { value: "executive", label: "Executive"   },
];

const SUGGESTED_QUERIES = [
  "Frontend Developer",
  "Backend Engineer",
  "Full Stack Developer",
  "Data Scientist",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Product Manager",
  "Mobile Developer",
  "Cloud Engineer",
  "Security Engineer",
];

interface HistoryEntry {
  query:      string;
  location:   string;
  experience: string;
}

function loadCache(): { query: string; location: string; experience: string; results: ScoredJob[] } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(entry: HistoryEntry) {
  try {
    const prev = loadHistory().filter(
      h => !(h.query === entry.query && h.location === entry.location && h.experience === entry.experience)
    );
    prev.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(prev.slice(0, 5)));
  } catch { /* quota */ }
}

export default function ScanPage() {
  const cached = loadCache();
  const [query,      setQuery]      = useState(cached?.query      ?? "");
  const [location,   setLocation]   = useState(cached?.location   ?? "");
  const [experience, setExperience] = useState(cached?.experience ?? "");
  const [results,    setResults]    = useState<ScoredJob[] | null>(cached?.results ?? null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [history,    setHistory]    = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (results && results.length > 0) {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ query, location, experience, results }));
      } catch { /* quota exceeded */ }
    }
  }, [results, query, location, experience]);

  const runSearch = useCallback(async (q: string, loc: string, exp: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }

    const levelLabel = EXPERIENCE_LEVELS.find(l => l.value === exp)?.label ?? "";
    const fullQuery  = exp && exp !== "mid" && levelLabel
      ? `${levelLabel} ${q}`.trim()
      : q.trim();

    try {
      const data = await scrapeJobs(fullQuery, loc);
      setResults(data);
      saveHistory({ query: q, location: loc, experience: exp });
      setHistory(loadHistory());
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("fetch")) {
        setError("Backend not reachable — make sure the FastAPI server is running on port 8000.");
      } else {
        setError(err instanceof Error ? err.message : "Search failed.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, location, experience);
  };

  const handleChipClick = (entry: HistoryEntry) => {
    setQuery(entry.query);
    setLocation(entry.location);
    setExperience(entry.experience);
    runSearch(entry.query, entry.location, entry.experience);
  };

  const handleSuggestionClick = (q: string) => {
    setQuery(q);
    runSearch(q, location, experience);
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--text-primary)" }}>Scan Jobs</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Find and score matching roles from RemoteOK</p>
      </div>

      {/* Search form */}
      <div className="p-5 rounded-2xl mb-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            {/* Query */}
            <div className="relative flex-1 min-w-[180px]">
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
                placeholder="Job title or keywords…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input pl-8 w-full"
                required
              />
            </div>

            {/* Location */}
            <div className="relative w-full sm:w-44">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              <input
                type="text"
                placeholder="Location (e.g. Remote)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="input pl-8 w-full"
              />
            </div>

            {/* Experience level */}
            <div className="relative w-full sm:w-40">
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <select
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                className="input pl-8 pr-7 w-full appearance-none"
              >
                {EXPERIENCE_LEVELS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <svg
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              >
                <path d="m6 9 6 6 6-6"/>
              </svg>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full sm:w-auto">
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </form>
      </div>

      {/* Past searches */}
      {history.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Recent Searches</p>
          <div className="flex flex-wrap gap-2">
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => handleChipClick(h)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--bg-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>{h.query}</span>
                {h.location && <span style={{ color: "var(--text-muted)" }}>· {h.location}</span>}
                {h.experience && h.experience !== "" && (
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                    style={{ background: "var(--accent-glow)", color: "var(--accent)" }}
                  >
                    {EXPERIENCE_LEVELS.find(l => l.value === h.experience)?.label}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested queries — only when no results yet */}
      {results === null && !loading && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Suggested Searches</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => handleSuggestionClick(q)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)", color: "var(--text-secondary)" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl mb-6"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 mt-0.5" style={{ color: "var(--red)" }}
          >
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <LoadingSpinner />
      ) : results === null ? null : results.length === 0 ? (
        <EmptyState message="No jobs found" description="Try different keywords or a broader search." />
      ) : (
        <>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{results.length} jobs found</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
