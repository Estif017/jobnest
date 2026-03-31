"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { searchJobs, deleteJob, Job } from "@/lib/api";
import Header from "@/components/Header";
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

  const load = useCallback(() => {
    setLoading(true);
    searchJobs(keyword, status === "All" ? "" : status)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [keyword, status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this job?")) return;
    await deleteJob(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  return (
    <div>
      <Header
        title="Jobs"
        actions={
          <Link
            href="/scan"
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            + Scan New
          </Link>
        }
      />

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by keyword..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="bg-[#111111] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2 w-64 focus:outline-none focus:border-blue-500"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-[#111111] border border-[#1f1f1f] text-white text-sm rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : jobs.length === 0 ? (
        <EmptyState
          message="No jobs found."
          action={
            <Link href="/scan" className="text-sm text-blue-400 hover:underline">
              Scan for jobs
            </Link>
          }
        />
      ) : (
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#525252] text-xs uppercase tracking-wider border-b border-[#1f1f1f]">
                <th className="text-left px-6 py-3">Title</th>
                <th className="text-left px-6 py-3">Company</th>
                <th className="text-left px-6 py-3">Location</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="text-left px-6 py-3">Fit Score</th>
                <th className="text-left px-6 py-3">Date Added</th>
                <th className="text-left px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
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
                  <td className="px-6 py-3 text-[#a3a3a3]">{job.location || "—"}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-6 py-3">
                    <FitScore score={null} />
                  </td>
                  <td className="px-6 py-3 text-[#a3a3a3]">{job.date_added}</td>
                  <td className="px-6 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="text-xs bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white px-2 py-1 rounded transition-colors"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="text-xs bg-[#991b1b]/20 hover:bg-[#991b1b]/40 text-red-400 px-2 py-1 rounded transition-colors"
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
