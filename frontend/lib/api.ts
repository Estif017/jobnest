/**
 * lib/api.ts — All HTTP calls to the JobNest FastAPI backend.
 *
 * Every function in this file is async and typed. The base URL comes from the
 * NEXT_PUBLIC_API_URL environment variable so it works in both development and
 * production without code changes. Add new endpoints here — never inline fetch
 * calls in components.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// TypeScript interfaces — mirror the Pydantic response schemas exactly
// ---------------------------------------------------------------------------

export interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  status: string;
  notes: string;
  date_added: string;
}

export interface JobAnalysis {
  id: number;
  job_id: number;
  fit_score: number;
  fit_reasons: string[];
  verdict: string;
  confidence: number;
  skill_gaps: string[];
  skills_matched: string[];
  cover_letter: string;
}

export interface GitHubProfile {
  id: number;
  username: string;
  repos: string[];
  languages: string[];
  topics: string[];
  top_skills: string[];
}

export interface ScoredJob {
  id: number;
  job: Job;
  fit_score: number;
  reasons: string[];
  verdict: string;
  session_id: string;
}

export interface DashboardStats {
  total_jobs: number;
  applied_count: number;
  interview_count: number;
  top_statuses: Record<string, number>;
}

export interface JobCreate {
  title: string;
  company: string;
  location?: string;
  url?: string;
  status?: string;
  notes?: string;
}

export interface JobUpdate {
  title?: string;
  company?: string;
  location?: string;
  url?: string;
  status?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Helper — throws with the API error detail message on non-2xx responses
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {}
    throw new Error(detail);
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {} as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const fetchDashboardStats = (): Promise<DashboardStats> =>
  apiFetch("/dashboard/stats");

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const fetchJobs = (): Promise<Job[]> =>
  apiFetch("/jobs");

export const fetchJob = (id: number): Promise<Job> =>
  apiFetch(`/jobs/${id}`);

export const createJob = (data: JobCreate): Promise<Job> =>
  apiFetch("/jobs", { method: "POST", body: JSON.stringify(data) });

export const updateJob = (id: number, data: JobUpdate): Promise<Job> =>
  apiFetch(`/jobs/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteJob = (id: number): Promise<void> =>
  apiFetch(`/jobs/${id}`, { method: "DELETE" });

export const searchJobs = (keyword = "", status = ""): Promise<Job[]> => {
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (status)  params.set("status", status);
  return apiFetch(`/jobs/search?${params.toString()}`);
};

// ---------------------------------------------------------------------------
// AI Analysis
// ---------------------------------------------------------------------------

export const fetchAnalysis = (jobId: number): Promise<JobAnalysis> =>
  apiFetch(`/jobs/${jobId}/analysis`);

export const analyzeJob = (jobId: number): Promise<JobAnalysis> =>
  apiFetch(`/jobs/${jobId}/analyze`, { method: "POST" });

// ---------------------------------------------------------------------------
// Scrape
// ---------------------------------------------------------------------------

export const scrapeJobs = (
  query: string,
  location: string,
  score = false
): Promise<ScoredJob[]> =>
  apiFetch("/scrape", {
    method: "POST",
    body: JSON.stringify({ query, location, score }),
  });

// ---------------------------------------------------------------------------
// Coach chat
// ---------------------------------------------------------------------------

export const coachChat = (message: string, jobId?: number): Promise<{ reply: string }> =>
  apiFetch("/coach/chat", {
    method: "POST",
    body: JSON.stringify({ message, job_id: jobId ?? null }),
  });

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export const fetchGitHub = (): Promise<GitHubProfile> =>
  apiFetch("/github");

export const fetchGitHubProfile = (username: string): Promise<GitHubProfile> =>
  apiFetch("/github/fetch", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
