"""
api/main.py — FastAPI application that wraps the JobNest Python modules as REST endpoints.

This file contains no business logic and writes no SQL. Every endpoint is a thin
wrapper that calls an existing function from db_operations, ai_coach, github_parser,
or smart_scraper and converts the result to a Pydantic response model. CORS is
configured for localhost:3000 so the Next.js frontend can call this server during
development. The database is initialized at startup so the API is self-contained —
no separate setup step required. Run with: uvicorn api.main:app --reload --port 8000
"""

import sys
import os
import warnings
from collections import Counter
from typing import List, Optional

# Suppress Google auth FutureWarnings about Python 3.9 end-of-life — noise only
warnings.filterwarnings("ignore", category=FutureWarning)

# Add the project root to sys.path so imports like "from db_operations import ..."
# work when uvicorn is launched from the project root directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from db_operations import (
    get_all_jobs,
    get_job_by_id,
    add_job,
    update_job,
    delete_job,
    search_jobs,
    load_analysis,
    load_github_profile,
    VALID_STATUSES,
)
from models import Job
from ai_coach import analyze_job, build_user_profile
from github_parser import fetch_github_profile
from smart_scraper import run_smart_search

from api.schemas import (
    JobCreate, JobUpdate, ScrapeRequest, GitHubFetchRequest,
    CoachChatRequest, CoachChatResponse,
    JobResponse, JobAnalysisResponse, GitHubProfileResponse,
    ScoredJobResponse, DashboardStats,
    job_to_dict, analysis_to_dict, github_to_dict, scored_job_to_dict,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="JobNest API",
    description="REST API for the JobNest job application tracker.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    """Initialize the SQLite database and all tables when the server starts."""
    init_db()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats():
    """
    Returns aggregated job counts for the dashboard stats row.
    Computes everything from get_all_jobs() — no separate query needed.
    """
    jobs   = get_all_jobs()
    counts = Counter(j.status for j in jobs)

    # Best fit score across all jobs that have been analyzed
    return DashboardStats(
        total_jobs=len(jobs),
        applied_count=counts.get("Applied", 0),
        interview_count=counts.get("Interviewing", 0),
        top_statuses=dict(counts),
    )


# ---------------------------------------------------------------------------
# Jobs — search MUST be registered before /{id} to avoid "search" matching as id
# ---------------------------------------------------------------------------

@app.get("/jobs/search", response_model=List[JobResponse])
def jobs_search(keyword: str = "", status: str = ""):
    """
    Searches jobs by keyword (title/company/notes) and/or status.
    Both params are optional — omitting both returns all jobs.
    """
    jobs = search_jobs(keyword=keyword, status=status)
    return [JobResponse(**job_to_dict(j)) for j in jobs]


@app.get("/jobs", response_model=List[JobResponse])
def jobs_list():
    """Returns all saved jobs ordered by database insertion."""
    return [JobResponse(**job_to_dict(j)) for j in get_all_jobs()]


@app.get("/jobs/{job_id}", response_model=JobResponse)
def jobs_get(job_id: int):
    """Returns a single job by id. 404 if not found."""
    job = get_job_by_id(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    return JobResponse(**job_to_dict(job))


@app.post("/jobs", response_model=JobResponse, status_code=201)
def jobs_create(body: JobCreate):
    """Creates a new job. Returns the saved job with its assigned id."""
    job = Job(
        title=body.title,
        company=body.company,
        location=body.location,
        url=body.url,
        status=body.status,
        notes=body.notes,
    )
    success = add_job(job)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save job.")

    # Fetch back the saved row to return the real database id
    saved = search_jobs(keyword=body.title)
    if not saved:
        raise HTTPException(status_code=500, detail="Job saved but could not be retrieved.")

    # Return the most recently added match
    return JobResponse(**job_to_dict(saved[-1]))


@app.put("/jobs/{job_id}", response_model=JobResponse)
def jobs_update(job_id: int, body: JobUpdate):
    """
    Updates one or more fields of a job. Only non-null fields in the body
    are applied — omitting a field leaves it unchanged in the database.
    """
    # Build kwargs from only the fields that were actually provided
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    success = update_job(job_id, **fields)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    job = get_job_by_id(job_id)
    return JobResponse(**job_to_dict(job))


@app.delete("/jobs/{job_id}", status_code=204)
def jobs_delete(job_id: int):
    """Permanently deletes a job by id. 404 if the id doesn't exist."""
    success = delete_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")


# ---------------------------------------------------------------------------
# Job analysis
# ---------------------------------------------------------------------------

@app.get("/jobs/{job_id}/analysis", response_model=JobAnalysisResponse)
def jobs_get_analysis(job_id: int):
    """Returns the most recent AI analysis for a job. 404 if none exists yet."""
    analysis = load_analysis(job_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail=f"No analysis found for job {job_id}.")
    return JobAnalysisResponse(**analysis_to_dict(analysis))


@app.post("/jobs/{job_id}/analyze", response_model=JobAnalysisResponse)
def jobs_analyze(job_id: int):
    """
    Runs AI analysis on a job using the stored user profile.
    Fetches the job and profile from the database, calls analyze_job(),
    saves the result, and returns the full JobAnalysis. Requires GEMINI_API_KEY.
    """
    job = get_job_by_id(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    profile = build_user_profile()
    if profile is None:
        raise HTTPException(
            status_code=400,
            detail="No user profile found. Parse a resume first via the CLI.",
        )

    try:
        analysis = analyze_job(job, profile)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return JobAnalysisResponse(**analysis_to_dict(analysis))


# ---------------------------------------------------------------------------
# Live scrape
# ---------------------------------------------------------------------------

@app.post("/scrape", response_model=List[ScoredJobResponse])
def scrape(body: ScrapeRequest):
    """
    Searches RemoteOK for live job listings matching the query, saves new ones
    to the tracker, and optionally scores them with Gemini (score=true).
    Returns the list of saved/scored jobs.
    """
    try:
        scored = run_smart_search(
            query=body.query,
            location=body.location,
            score=body.score,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # scored only contains newly inserted jobs; also return existing DB matches
    # so the frontend never shows an empty list when jobs already exist.
    from models import ScoredJob as ScoredJobModel
    scored_ids = {s.job.id for s in scored}
    all_matching = search_jobs(keyword=body.query)
    for job in all_matching:
        if job.id not in scored_ids:
            scored.append(ScoredJobModel(job=job))

    return [ScoredJobResponse(**scored_job_to_dict(s)) for s in scored]


# ---------------------------------------------------------------------------
# GitHub profile
# ---------------------------------------------------------------------------

@app.get("/github", response_model=GitHubProfileResponse)
def github_get():
    """Returns the stored GitHub profile. 404 if none has been fetched yet."""
    profile = load_github_profile()
    if profile is None:
        raise HTTPException(status_code=404, detail="No GitHub profile found.")
    return GitHubProfileResponse(**github_to_dict(profile))


@app.post("/coach/chat", response_model=CoachChatResponse)
def coach_chat(body: CoachChatRequest):
    """
    Sends a user message to Claude and returns a career coaching reply.
    Optionally accepts a job_id to include that job as context in the prompt.
    Reads ANTHROPIC_API_KEY from the environment automatically.
    """
    import anthropic

    context_parts = []

    profile = build_user_profile()
    if profile:
        skills = ", ".join(profile.all_skills[:15]) or "None listed"
        exp = "; ".join(
            f"{e.title} at {e.company}" for e in profile.resume.experience[:3]
        ) or "None listed"
        context_parts.append(
            f"Candidate: {profile.resume.name}\nSkills: {skills}\nExperience: {exp}"
        )

    if body.job_id:
        job = get_job_by_id(body.job_id)
        if job:
            context_parts.append(
                f"Job being discussed: {job.title} at {job.company} ({job.location or 'Remote'})\n"
                f"Status: {job.status}\nNotes: {job.notes or 'None'}"
            )

    system = (
        "You are a career coach helping a job seeker. "
        "Be concise, practical, and encouraging. "
        "If candidate or job context is provided, use it to give specific advice."
    )

    user_message = "\n\n".join(context_parts + [body.message]) if context_parts else body.message

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=system,
            messages=[{"role": "user", "content": user_message}],
        )
        return CoachChatResponse(reply=response.content[0].text)
    except Exception as e:
        print(f"[coach/chat error] {e}")
        return CoachChatResponse(reply=f"Coach unavailable: {e}")


@app.post("/github/fetch", response_model=GitHubProfileResponse)
def github_fetch(body: GitHubFetchRequest):
    """
    Fetches a GitHub user's public profile via the GitHub API and saves it.
    Raises 400 if the username doesn't exist or the API call fails.
    """
    try:
        profile = fetch_github_profile(body.username)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    return GitHubProfileResponse(**github_to_dict(profile))
