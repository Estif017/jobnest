"use client";

import { useState } from "react";
import { scrapeJobs, ScoredJob } from "@/lib/api";
import Header from "@/components/Header";
import JobCard from "@/components/JobCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import EmptyState from "@/components/EmptyState";

export default function ScanPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<ScoredJob[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const data = await scrapeJobs(query, location);
      setResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Scan Jobs" />

      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <input
          type="text"
          placeholder="Job title or keywords..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-[#111111] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2 w-72 focus:outline-none focus:border-blue-500"
          required
        />
        <input
          type="text"
          placeholder="Location (e.g. Remote)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="bg-[#111111] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2 w-56 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded transition-colors"
        >
          Search
        </button>
      </form>

      {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : results === null ? null : results.length === 0 ? (
        <EmptyState message="No jobs found. Try different keywords." />
      ) : (
        <>
          <p className="text-[#a3a3a3] text-sm mb-4">{results.length} jobs found</p>
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
