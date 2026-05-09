/**
 * lib/api.ts — All HTTP calls to the JobNest FastAPI backend.
 *
 * Every function in this file is async and typed. The base URL comes from the
 * NEXT_PUBLIC_API_URL environment variable so it works in both development and
 * production without code changes. Add new endpoints here — never inline fetch
 * calls in components.
 */

// ---------------------------------------------------------------------------
// API token — short-lived HS256 JWT issued by /api/auth/token, verified by
// the backend using the shared NEXTAUTH_SECRET. Cached in memory and
// refreshed automatically when it has less than 60 s left.
// ---------------------------------------------------------------------------

let _apiToken: string | null = null;
let _apiTokenExp = 0;
let _tokenPromise: Promise<string> | null = null;

async function getApiToken(): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (_apiToken && _apiTokenExp - nowSec > 60) return _apiToken;
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    try {
      const res = await fetch("/api/auth/token");
      if (!res.ok) throw new Error("Session expired. Please sign in again.");
      const { token } = await res.json();
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        _apiTokenExp = payload.exp ?? nowSec + 3600;
      } catch {
        _apiTokenExp = nowSec + 3500;
      }
      _apiToken = token;
      return token as string;
    } finally {
      _tokenPromise = null;
    }
  })();

  return _tokenPromise;
}

// Keep this export so providers.tsx compiles without changes — it's now a no-op
// because user identity is carried in the signed Bearer token, not in a header.
export function setApiUserId(_id: string | undefined) { /* no-op */ }

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
  fit_score: number | null;
  date_applied: string | null;
  follow_up_date: string | null;
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
  date_applied?: string | null;
  follow_up_date?: string | null;
}

// ---------------------------------------------------------------------------
// Helper — throws with the API error detail message on non-2xx responses
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getApiToken();
  const { headers: initHeaders, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(initHeaders as Record<string, string> | undefined),
    },
    ...rest,
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

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await getApiToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); detail = b.detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  job_id: number | null;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unread_count: number;
}

export const fetchNotifications = (): Promise<NotificationsResponse> =>
  apiFetch("/notifications");

export const markNotificationRead = (id: number): Promise<void> =>
  apiFetch(`/notifications/${id}/read`, { method: "POST" });

export const markAllNotificationsRead = (): Promise<void> =>
  apiFetch("/notifications/read-all", { method: "POST" });

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

export const exportJobsCsv = async (): Promise<void> => {
  const token = await getApiToken();
  const res = await fetch(`${BASE}/jobs/export.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "jobnest-jobs.csv";
  a.click();
  URL.revokeObjectURL(url);
};

export const searchJobs = (keyword = "", status = ""): Promise<Job[]> => {
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (status)  params.set("status", status);
  return apiFetch(`/jobs/search?${params.toString()}`);
};

export interface JobImport {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
}

export const importJobFromUrl = (url: string): Promise<JobImport> =>
  apiFetch("/jobs/import-url", { method: "POST", body: JSON.stringify({ url }) });

// ---------------------------------------------------------------------------
// AI Analysis
// ---------------------------------------------------------------------------

export const fetchAnalysis = (jobId: number): Promise<JobAnalysis> =>
  apiFetch(`/jobs/${jobId}/analysis`);

export const analyzeJob = (jobId: number): Promise<JobAnalysis> =>
  apiFetch(`/jobs/${jobId}/analyze`, { method: "POST" });

// ---------------------------------------------------------------------------
// Company news (agentic web search)
// ---------------------------------------------------------------------------

export interface CompanyNews {
  company: string;
  bullets: string[];
}

export const fetchCompanyNews = (jobId: number): Promise<CompanyNews> =>
  apiFetch(`/jobs/${jobId}/company-news`);

export interface AgentAnalysis {
  analysis: string;
  tool_calls: Array<{ query: string; results_count: number }>;
  job_id: number;
}

export const agentAnalyzeJob = (jobId: number): Promise<AgentAnalysis> =>
  apiFetch(`/jobs/${jobId}/agent-analyze`, { method: "POST" });

// ---------------------------------------------------------------------------
// Interview Prep
// ---------------------------------------------------------------------------

export interface InterviewQuestion {
  question: string;
  answer: string;
}

export interface InterviewPrep {
  job_id: number;
  questions: InterviewQuestion[];
  research: string[];
  smart_question: string;
}

export const fetchInterviewPrep = (jobId: number): Promise<InterviewPrep> =>
  apiFetch(`/jobs/${jobId}/interview-prep`);

export const generateInterviewPrep = (jobId: number): Promise<InterviewPrep> =>
  apiFetch(`/jobs/${jobId}/interview-prep`, { method: "POST" });

export interface AgentToolCall {
  tool: "search_web" | "get_candidate_profile";
  query: string | null;
  results_count: number | null;
}

export interface AgentProduceResult {
  resume_summary: string;
  cover_letter: string;
  tool_calls: AgentToolCall[];
  job_id: number;
}

export const agentProduceJob = (jobId: number): Promise<AgentProduceResult> =>
  apiFetch(`/jobs/${jobId}/agent-produce`, { method: "POST" });

// ---------------------------------------------------------------------------
// Full Hunt — The Orchestrator
// ---------------------------------------------------------------------------

export interface FullHuntToolCall {
  tool:  "analyze_job" | "write_application" | "get_coach_advice";
  input: Record<string, unknown>;
  error?: string;
}

export interface FullHuntAnalysis {
  fit_score:      number;
  verdict:        string;
  confidence:     number;
  fit_reasons:    string[];
  skills_matched: string[];
  skill_gaps:     string[];
}

export interface FullHuntResult {
  verdict:              string | null;
  fit_score:            number | null;
  analysis:             FullHuntAnalysis | null;
  resume_summary:       string | null;
  cover_letter:         string | null;
  coach_advice:         string | null;
  orchestrator_summary: string | null;
  tool_calls_log:       FullHuntToolCall[];
}

export const fullHuntJob = (jobId: number): Promise<FullHuntResult> =>
  apiFetch(`/jobs/${jobId}/full-hunt`, { method: "POST" });

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
// Auth
// ---------------------------------------------------------------------------

export const registerUser = (email: string, password: string): Promise<{ message: string }> =>
  apiFetch("/auth/register", {
    method: "POST",
    body:   JSON.stringify({ email, password }),
  });

export const markOnboardingComplete = (userId: string): Promise<{ message: string }> =>
  apiFetch("/auth/onboarding-complete", {
    method: "POST",
    body:   JSON.stringify({ user_id: Number(userId) }),
  });

export const changePassword = (current: string, newPassword: string): Promise<{ message: string }> =>
  apiFetch("/auth/change-password", {
    method: "POST",
    body:   JSON.stringify({ current, new_password: newPassword }),
  });

// ---------------------------------------------------------------------------
// Coach chat
// ---------------------------------------------------------------------------

export interface ChatHistoryMessage {
  role:      string;
  message:   string;
  timestamp: string;
}

export interface ChatSession {
  session_id:  string;
  title:       string;
  last_active: string;
}

export const fetchCoachHistory = (sessionId?: string): Promise<ChatHistoryMessage[]> =>
  apiFetch(`/coach/history${sessionId ? `?session_id=${sessionId}` : ""}`);

export const deleteCoachSession = (sessionId: string): Promise<void> =>
  apiFetch(`/coach/sessions/${sessionId}`, { method: "DELETE" });

export const fetchCoachSessions = (): Promise<ChatSession[]> =>
  apiFetch("/coach/sessions");

export const coachChat = (
  message: string,
  jobId?: number,
  sessionId?: string,
): Promise<{ reply: string }> =>
  apiFetch("/coach/chat", {
    method: "POST",
    body: JSON.stringify({ message, job_id: jobId ?? null, session_id: sessionId ?? null }),
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

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export interface OnboardingData {
  target_role:        string;
  target_industries:  string[];
  seniority_level:    string;
  employment_types:   string[];
  work_model:         string;
  current_location:   string;
  open_to_relocation: boolean;
  salary_min:         number;
  salary_max:         number;
  salary_currency:    string;
  years_experience:   string;
  top_skills_manual:  string[];
  certifications:     string;
  linkedin_url:       string;
  portfolio_url:      string;
  github_username:    string;
  alert_threshold:    number;
  name?:              string;
  skills?:            string[];
}

export const fetchOnboardingData = (): Promise<OnboardingData> =>
  apiFetch("/onboarding/data");

export const saveOnboardingData = (data: Partial<OnboardingData>): Promise<{ message: string }> =>
  apiFetch("/onboarding/save", {
    method: "POST",
    body:   JSON.stringify(data),
  });

export const uploadResume = (file: File): Promise<{ name: string; skills: string[]; experience_count: number; education_count: number }> => {
  const fd = new FormData();
  fd.append("file", file);
  return apiUpload("/parse-resume", fd);
};

// ---------------------------------------------------------------------------
// Resume versioning
// ---------------------------------------------------------------------------

export interface ResumeVersion {
  id: number;
  version: number;
  filename: string;
  uploaded_at: string;
  name: string;
  is_active: boolean;
  skills_count: number;
}

export const fetchResumeVersions = (): Promise<ResumeVersion[]> =>
  apiFetch("/resume/versions");

export const activateResumeVersion = (id: number): Promise<void> =>
  apiFetch(`/resume/versions/${id}/activate`, { method: "POST" });
