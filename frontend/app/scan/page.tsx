"use client";

import { useState, useEffect } from "react";
import { scrapeJobs, ScoredJob } from "@/lib/api";
import JobCard from "@/components/JobCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

const CACHE_KEY = "scan_results_cache";

function loadCache(): { query: string; location: string; results: ScoredJob[] } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function ScanPage() {
  const cached = loadCache();
  const [query, setQuery] = useState(cached?.query ?? "");
  const [location, setLocation] = useState(cached?.location ?? "");
  const [results, setResults] = useState<ScoredJob[] | null>(cached?.results ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (results && results.length > 0) {
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ query, location, results }));
      } catch { /* quota exceeded */ }
    }
  }, [results, query, location]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    try {
      const data = await scrapeJobs(query, location);
      setResults(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("fetch")) {
        setError("Backend not reachable — make sure the FastAPI server is running on port 8000.");
      } else {
        setError(err instanceof Error ? err.message : "Search failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--text-primary)" }}>Scan Jobs</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Find and score matching roles from RemoteOK</p>
      </div>

      <div className="p-5 rounded-2xl mb-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
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
              placeholder="Job title or keywords…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-8"
              required
            />
          </div>
          <div className="relative w-48">
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
              className="input pl-8"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
      </div>

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
