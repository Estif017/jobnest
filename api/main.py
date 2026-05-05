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
import tempfile
import warnings
from collections import Counter
from typing import List, Optional
from dotenv import load_dotenv

# Load .env before anything else so os.getenv() picks up all keys
load_dotenv()

# Suppress Google auth FutureWarnings about Python 3.9 end-of-life — noise only
warnings.filterwarnings("ignore", category=FutureWarning)

# Add the project root to sys.path so imports like "from db_operations import ..."
# work when uvicorn is launched from the project root directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile
from fastapi import File as FastFile
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, migrate_db
from api.auth_routes import router as auth_router
from db_operations import (
    get_all_jobs,
    get_job_by_id,
    add_job,
    update_job,
    delete_job,
    search_jobs,
    load_analysis,
    load_github_profile,
    save_github_profile,
    save_chat_message,
    load_chat_history,
    save_onboarding_data,
    load_onboarding_data,
    get_notifications,
    get_unread_count,
    mark_notification_read,
    mark_all_notifications_read,
    save_interview_prep,
    load_interview_prep,
    VALID_STATUSES,
)
from api.scheduler import start_scheduler, hunt_new_jobs
from models import Job
from ai_coach import analyze_job, build_user_profile
from github_parser import fetch_github_profile
from resume_parser import parse_resume as do_parse_resume
from smart_scraper import run_smart_search

from api.schemas import (
    JobCreate, JobUpdate, ScrapeRequest, GitHubFetchRequest,
    CoachChatRequest, CoachChatResponse, ChatMessage,
    JobResponse, JobAnalysisResponse, GitHubProfileResponse,
    ScoredJobResponse, DashboardStats,
    OnboardingDataRequest, OnboardingDataResponse,
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


app.include_router(auth_router)


@app.on_event("startup")
def startup():
    """Initialize the database and start the background job hunter."""
    init_db()
    migrate_db()
    app.state.scheduler = start_scheduler()


@app.on_event("shutdown")
def shutdown():
    """Shut down the background scheduler cleanly when the server exits."""
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)


# ---------------------------------------------------------------------------
# User ID dependency — reads X-User-Id header, defaults to 1 for CLI compat
# ---------------------------------------------------------------------------

def get_user_id(x_user_id: Optional[str] = Header(None)) -> int:
    """Reads user id from X-User-Id request header. Defaults to 1 for CLI backward compat."""
    if x_user_id is None:
        return 1
    try:
        return int(x_user_id)
    except (ValueError, TypeError):
        return 1


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Scheduler — status and manual trigger
# ---------------------------------------------------------------------------

@app.get("/scheduler/status")
def scheduler_status():
    """
    Returns the next scheduled hunt time and whether the scheduler is running.
    Useful for verifying the background hunter is alive.
    """
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler is None or not scheduler.running:
        return {"running": False, "next_run": None}

    job = scheduler.get_job("job_hunter")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    return {"running": True, "next_run": next_run}


@app.post("/scheduler/run-now")
def scheduler_run_now():
    """
    Triggers the job hunt immediately without waiting for the 24-hour interval.
    Runs synchronously in the request — expect it to take 30-60 seconds.
    Use this to test the full pipeline without changing the interval.
    """
    hunt_new_jobs()
    return {"message": "Hunt complete. Check server logs for results."}


# ---------------------------------------------------------------------------
# Interview Prep Pack — auto-generated when status changes to Interviewing
#
# Claude receives the job + the candidate's full profile and produces:
#   - 5 role-specific interview questions + a tailored answer for each
#   - 3 research topics to cover before the interview
#   - 1 smart question to ask the interviewer
#
# Results are saved so the page loads instantly on repeat visits.
# ---------------------------------------------------------------------------

@app.get("/jobs/{job_id}/interview-prep")
def jobs_get_interview_prep(job_id: int, user_id: int = Depends(get_user_id)):
    """Returns the stored interview prep for a job. 404 if not generated yet."""
    prep = load_interview_prep(job_id, user_id)
    if prep is None:
        raise HTTPException(status_code=404, detail="No interview prep found for this job.")
    return prep


@app.post("/jobs/{job_id}/interview-prep")
def jobs_generate_interview_prep(job_id: int, user_id: int = Depends(get_user_id)):
    """
    Generates an interview prep pack using Claude.
    Saves the result so subsequent GETs return instantly.
    """
    import anthropic
    import json
    import re

    job = get_job_by_id(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    profile = build_user_profile(user_id)

    candidate_context = ""
    if profile:
        exp_lines = "\n".join(
            f"  - {e.title} at {e.company} ({e.years})"
            for e in profile.resume.experience
        )
        candidate_context = (
            f"\nCandidate: {profile.resume.name}\n"
            f"Skills: {', '.join(profile.all_skills[:12])}\n"
            f"Experience:\n{exp_lines or '  (none listed)'}"
        )

    prompt = (
        f"You are an expert interview coach. Generate an interview prep pack for this candidate.\n"
        f"{candidate_context}\n\n"
        f"Role: {job.title}\n"
        f"Company: {job.company}\n"
        f"Location: {job.location or 'Not specified'}\n"
        f"Job notes: {job.notes or 'None'}\n\n"
        f"Return ONLY a JSON object with this exact shape:\n"
        f'{{\n'
        f'  "questions": [\n'
        f'    {{"question": "...", "answer": "2-3 sentences using the candidate\'s background"}},\n'
        f'    ... (5 total)\n'
        f'  ],\n'
        f'  "research": ["topic 1", "topic 2", "topic 3"],\n'
        f'  "smart_question": "One insightful question to ask the interviewer"\n'
        f'}}\n\n'
        f"Make every answer specific to the candidate\'s actual experience. "
        f"Make every question realistic for this exact role and company."
    )

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        parsed = json.loads(match.group()) if match else {}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude failed: {e}")

    questions      = parsed.get("questions", [])
    research       = parsed.get("research", [])
    smart_question = parsed.get("smart_question", "")

    if not questions:
        raise HTTPException(status_code=502, detail="Claude returned an empty prep pack.")

    save_interview_prep(job_id, user_id, questions, research, smart_question)

    return {
        "job_id":         job_id,
        "questions":      questions,
        "research":       research,
        "smart_question": smart_question,
    }


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@app.get("/notifications")
def notifications_list(user_id: int = Depends(get_user_id)):
    """Returns recent notifications and the unread count for the current user."""
    items = get_notifications(user_id)
    unread = get_unread_count(user_id)
    return {"notifications": items, "unread_count": unread}


@app.post("/notifications/read-all", status_code=204)
def notifications_read_all(user_id: int = Depends(get_user_id)):
    """Marks every notification as read for the current user."""
    mark_all_notifications_read(user_id)


@app.post("/notifications/{notification_id}/read", status_code=204)
def notifications_read_one(notification_id: int, user_id: int = Depends(get_user_id)):
    """Marks a single notification as read."""
    mark_notification_read(notification_id, user_id)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/dashboard/stats", response_model=DashboardStats)
def dashboard_stats(user_id: int = Depends(get_user_id)):
    """
    Returns aggregated job counts for the dashboard stats row.
    Computes everything from get_all_jobs() — no separate query needed.
    """
    jobs   = get_all_jobs(user_id)
    counts = Counter(j.status for j in jobs)

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
def jobs_search(keyword: str = "", status: str = "", user_id: int = Depends(get_user_id)):
    """
    Searches jobs by keyword (title/company/notes) and/or status.
    Both params are optional — omitting both returns all jobs.
    """
    jobs = search_jobs(keyword=keyword, status=status, user_id=user_id)
    return [JobResponse(**job_to_dict(j)) for j in jobs]


@app.get("/jobs", response_model=List[JobResponse])
def jobs_list(user_id: int = Depends(get_user_id)):
    """Returns all saved jobs ordered by database insertion."""
    return [JobResponse(**job_to_dict(j)) for j in get_all_jobs(user_id)]


@app.get("/jobs/{job_id}", response_model=JobResponse)
def jobs_get(job_id: int, user_id: int = Depends(get_user_id)):
    """Returns a single job by id. 404 if not found."""
    job = get_job_by_id(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    return JobResponse(**job_to_dict(job))


@app.post("/jobs", response_model=JobResponse, status_code=201)
def jobs_create(body: JobCreate, user_id: int = Depends(get_user_id)):
    """Creates a new job. Returns the saved job with its assigned id."""
    job = Job(
        title=body.title,
        company=body.company,
        location=body.location,
        url=body.url,
        status=body.status,
        notes=body.notes,
    )
    success = add_job(job, user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save job.")

    # Fetch back the saved row to return the real database id
    saved = search_jobs(keyword=body.title, user_id=user_id)
    if not saved:
        raise HTTPException(status_code=500, detail="Job saved but could not be retrieved.")

    # Return the most recently added match
    return JobResponse(**job_to_dict(saved[-1]))


@app.put("/jobs/{job_id}", response_model=JobResponse)
def jobs_update(job_id: int, body: JobUpdate, user_id: int = Depends(get_user_id)):
    """
    Updates one or more fields of a job. Only non-null fields in the body
    are applied — omitting a field leaves it unchanged in the database.
    """
    # Build kwargs from only the fields that were actually provided
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    success = update_job(job_id, user_id, **fields)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    job = get_job_by_id(job_id, user_id)
    return JobResponse(**job_to_dict(job))


@app.delete("/jobs/{job_id}", status_code=204)
def jobs_delete(job_id: int, user_id: int = Depends(get_user_id)):
    """Permanently deletes a job by id. 404 if the id doesn't exist."""
    success = delete_job(job_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")


# ---------------------------------------------------------------------------
# Job analysis
# ---------------------------------------------------------------------------

@app.get("/jobs/{job_id}/analysis", response_model=JobAnalysisResponse)
def jobs_get_analysis(job_id: int, user_id: int = Depends(get_user_id)):
    """Returns the most recent AI analysis for a job. 404 if none exists yet."""
    analysis = load_analysis(job_id, user_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail=f"No analysis found for job {job_id}.")
    return JobAnalysisResponse(**analysis_to_dict(analysis))


@app.post("/jobs/{job_id}/analyze", response_model=JobAnalysisResponse)
def jobs_analyze(job_id: int, user_id: int = Depends(get_user_id)):
    """
    Runs AI analysis on a job using the stored user profile.
    Fetches the job and profile from the database, calls analyze_job(),
    saves the result, and returns the full JobAnalysis. Requires ANTHROPIC_API_KEY.
    """
    job = get_job_by_id(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    profile = build_user_profile(user_id)
    if profile is None:
        raise HTTPException(
            status_code=400,
            detail="No user profile found. Parse a resume first via the CLI.",
        )

    try:
        analysis = analyze_job(job, profile, user_id)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return JobAnalysisResponse(**analysis_to_dict(analysis))


# ---------------------------------------------------------------------------
# Company news — "Give the Agent Eyes"
#
# How this works (agentic pattern):
#   1. PERCEIVE  — receive the job_id from the frontend
#   2. ACT       — call Tavily (web search tool) to find recent news
#   3. SYNTHESIZE — feed raw search results to Claude, ask for 3 bullets
#   4. RESPOND   — return structured bullets to the frontend
#
# Tavily is purpose-built for AI agents: it returns clean, pre-filtered
# text snippets rather than raw HTML, so the LLM gets signal, not noise.
# ---------------------------------------------------------------------------

@app.get("/jobs/{job_id}/company-news")
def company_news(job_id: int, user_id: int = Depends(get_user_id)):
    """
    Searches the web for recent news about the job's company and returns
    a 3-bullet summary generated by Claude. Requires TAVILY_API_KEY and
    ANTHROPIC_API_KEY in the environment.
    """
    import anthropic
    from tavily import TavilyClient

    # Step 1 — get the company name from the database
    job = get_job_by_id(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    company = job.company.strip()

    # Step 2 — use Tavily to search the web (the "eyes")
    tavily_key = os.getenv("TAVILY_API_KEY")
    if not tavily_key:
        raise HTTPException(status_code=500, detail="TAVILY_API_KEY not set.")

    tavily = TavilyClient(api_key=tavily_key)
    try:
        results = tavily.search(
            query=f"{company} company news 2024 2025",
            search_depth="basic",
            max_results=5,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Web search failed: {e}")

    # Step 3 — extract the text snippets from Tavily's results
    snippets = "\n\n".join(
        f"- {r.get('title', '')}: {r.get('content', '')}"
        for r in results.get("results", [])
    )

    if not snippets:
        return {"company": company, "bullets": ["No recent news found for this company."]}

    # Step 4 — ask Claude to synthesize into 3 clean bullets
    anthropic_client = anthropic.Anthropic()
    prompt = (
        f"Here are recent web search results about the company '{company}':\n\n"
        f"{snippets}\n\n"
        f"Write exactly 3 short bullet points summarizing the most relevant and recent "
        f"news about this company from a job seeker's perspective. "
        f"Focus on: funding, layoffs, growth, leadership changes, product launches, or culture. "
        f"Each bullet should be one sentence. Return only the 3 bullets, no intro text."
    )

    try:
        response = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Parse bullets — strip leading "- " or "• " or "1. " markers
        bullets = [
            line.lstrip("-•123. ").strip()
            for line in raw.split("\n")
            if line.strip() and not line.strip().isdigit()
        ][:3]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude summarization failed: {e}")

    return {"company": company, "bullets": bullets}


# ---------------------------------------------------------------------------
# Agent Analyze — "Let the Agent Decide" using Claude Tool Use
#
# Instead of hardcoding "call Tavily → summarize", Claude receives:
#   - The job info + a search_web tool definition
#   - It decides on its own whether and what to search
#   - The backend only calls Tavily when Claude emits a tool_use block
#
# Agentic loop:
#   1. Send job context + tools to Claude
#   2. Claude returns stop_reason="tool_use" → execute tool → feed result back
#   3. Repeat until stop_reason="end_turn"
#   4. Return final analysis + log of searches Claude chose to make
# ---------------------------------------------------------------------------

@app.post("/jobs/{job_id}/agent-analyze")
def jobs_agent_analyze(job_id: int, user_id: int = Depends(get_user_id)):
    """
    Runs an agentic analysis of a job using Claude's Tool Use API.
    Claude decides when to call search_web — the backend never hardcodes it.
    Returns the final analysis text + every search query Claude issued.
    """
    import anthropic
    from tavily import TavilyClient

    job = get_job_by_id(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    tavily_key = os.getenv("TAVILY_API_KEY")
    if not tavily_key:
        raise HTTPException(status_code=500, detail="TAVILY_API_KEY not set.")

    claude = anthropic.Anthropic()
    tavily = TavilyClient(api_key=tavily_key)

    # The tool Claude can choose to call — one clean capability
    tools = [{
        "name": "search_web",
        "description": (
            "Search the web for current information about a company or job posting. "
            "Use this to find recent news, funding rounds, layoffs, product launches, "
            "company size, culture, or any facts that would help a job seeker decide "
            "whether to apply."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to look up on the web."
                }
            },
            "required": ["query"]
        }
    }]

    # Build candidate context if a profile exists
    profile = build_user_profile(user_id)
    candidate_context = ""
    if profile:
        top_skills = ", ".join(profile.all_skills[:8]) or "not listed"
        candidate_context = f"\n\nCandidate top skills: {top_skills}"

    initial_message = (
        f"Analyze this job opportunity for a candidate.{candidate_context}\n\n"
        f"Job Title: {job.title}\n"
        f"Company: {job.company}\n"
        f"Location: {job.location or 'Not specified'}\n"
        f"Notes / Description: {job.notes or 'None provided'}\n\n"
        f"Steps:\n"
        f"1. Use search_web to research {job.company} — look for recent news, "
        f"growth signals, layoffs, culture, or anything a job seeker should know.\n"
        f"2. Give a verdict: APPLY, SKIP, or RED FLAG.\n"
        f"3. List 2–3 concise reasons that combine role fit with what you found.\n"
        f"4. Call out any green flags or concerns."
    )

    messages = [{"role": "user", "content": initial_message}]
    tool_calls_log: list = []

    # Agentic loop — exits on end_turn or unexpected stop_reason
    while True:
        response = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            tools=tools,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            final_text = next(
                (block.text for block in response.content if hasattr(block, "text")),
                "Analysis complete."
            )
            break

        if response.stop_reason == "tool_use":
            # Append Claude's tool_use blocks to the conversation
            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for block in response.content:
                if block.type == "tool_use" and block.name == "search_web":
                    query = block.input["query"]

                    try:
                        search_response = tavily.search(
                            query=query,
                            search_depth="basic",
                            max_results=4,
                        )
                        raw_results = search_response.get("results", [])
                        snippets = "\n\n".join(
                            f"[{r.get('title', '')}]: {r.get('content', '')}"
                            for r in raw_results
                        )
                        results_count = len(raw_results)
                    except Exception as e:
                        snippets = f"Search failed: {e}"
                        results_count = 0

                    tool_calls_log.append({"query": query, "results_count": results_count})

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": snippets or "No results found.",
                    })

            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop_reason — break to avoid infinite loop
        final_text = "Analysis stopped unexpectedly."
        break

    return {
        "analysis": final_text,
        "tool_calls": tool_calls_log,
        "job_id": job_id,
    }


# ---------------------------------------------------------------------------
# Agent Produce — "The Agent Acts" using Claude Tool Use
#
# Claude gets ONE prompt and TWO tools:
#   - search_web        → calls Tavily; Claude decides the query
#   - get_candidate_profile → returns the user's full resume + skills
#
# Claude decides when to call each tool. Once it has what it needs it writes:
#   - A tailored resume summary (2-3 sentences) for the specific job
#   - A 3-paragraph cover letter
#
# The tool_calls log captures every tool Claude chose to invoke so the
# frontend can show the full decision trail.
# ---------------------------------------------------------------------------

@app.post("/jobs/{job_id}/agent-produce")
def jobs_agent_produce(job_id: int, user_id: int = Depends(get_user_id)):
    """
    Agentic writing endpoint: Claude researches the company and reads the
    candidate's profile — deciding on its own when to call each tool — then
    produces a tailored resume summary and 3-paragraph cover letter.
    """
    import anthropic
    import json
    import re
    from tavily import TavilyClient

    job = get_job_by_id(job_id, user_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    tavily_key = os.getenv("TAVILY_API_KEY")
    if not tavily_key:
        raise HTTPException(status_code=500, detail="TAVILY_API_KEY not set.")

    claude = anthropic.Anthropic()
    tavily = TavilyClient(api_key=tavily_key)

    tools = [
        {
            "name": "search_web",
            "description": (
                "Search the web for current information about a company or job. "
                "Use this to find recent news, culture, values, growth stage, "
                "tech stack, or anything that would help tailor a cover letter."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to look up on the web."
                    }
                },
                "required": ["query"]
            }
        },
        {
            "name": "get_candidate_profile",
            "description": (
                "Returns the candidate's full resume: name, skills, work experience, "
                "education, and raw resume text. Call this to understand who you are "
                "writing for before drafting the summary or cover letter."
            ),
            "input_schema": {
                "type": "object",
                "properties": {}
            }
        }
    ]

    initial_message = (
        f"You are a senior career coach and professional writer. You have been asked to "
        f"produce two deliverables for a job application:\n\n"
        f"1. A tailored 2-3 sentence professional resume summary for the role.\n"
        f"2. A compelling 3-paragraph cover letter, tailored to this company and role.\n\n"
        f"Target role:\n"
        f"  Title:    {job.title}\n"
        f"  Company:  {job.company}\n"
        f"  Location: {job.location or 'Not specified'}\n"
        f"  Notes:    {job.notes or 'None provided'}\n\n"
        f"Steps you must follow:\n"
        f"  - Call get_candidate_profile to learn who the candidate is.\n"
        f"  - Call search_web to research {job.company} — culture, values, recent news.\n"
        f"  - Then write both deliverables, weaving the candidate's background into the "
        f"company's specific context.\n\n"
        f"Return your answer as a JSON object with exactly these keys:\n"
        f'{{"resume_summary": "...", "cover_letter": "para1\\n\\npara2\\n\\npara3"}}'
    )

    messages = [{"role": "user", "content": initial_message}]
    tool_calls_log: list = []

    while True:
        response = claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            tools=tools,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            final_text = next(
                (block.text for block in response.content if hasattr(block, "text")),
                "{}"
            )
            break

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                if block.name == "search_web":
                    query = block.input["query"]
                    try:
                        sr = tavily.search(query=query, search_depth="basic", max_results=4)
                        raw = sr.get("results", [])
                        snippets = "\n\n".join(
                            f"[{r.get('title','')}]: {r.get('content','')}"
                            for r in raw
                        )
                        results_count = len(raw)
                    except Exception as e:
                        snippets = f"Search failed: {e}"
                        results_count = 0

                    tool_calls_log.append({
                        "tool": "search_web",
                        "query": query,
                        "results_count": results_count,
                    })
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": snippets or "No results found.",
                    })

                elif block.name == "get_candidate_profile":
                    profile = build_user_profile(user_id)
                    if profile:
                        profile_data = {
                            "name": profile.resume.name,
                            "skills": profile.all_skills,
                            "experience": [
                                {
                                    "title": e.title,
                                    "company": e.company,
                                    "years": e.years,
                                }
                                for e in profile.resume.experience
                            ],
                            "education": [
                                {
                                    "degree": ed.degree,
                                    "institution": ed.institution,
                                    "year": ed.year,
                                }
                                for ed in profile.resume.education
                            ],
                            # Raw resume text gives Claude the richest signal for writing
                            "raw_resume": profile.resume.raw_text[:4000],
                        }
                        content = json.dumps(profile_data)
                    else:
                        content = "No candidate profile found. The user has not uploaded a resume yet."

                    tool_calls_log.append({
                        "tool": "get_candidate_profile",
                        "query": None,
                        "results_count": None,
                    })
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": content,
                    })

            messages.append({"role": "user", "content": tool_results})
            continue

        final_text = "{}"
        break

    # Extract JSON from Claude's response — handles markdown code fences
    try:
        json_match = re.search(r'\{.*\}', final_text, re.DOTALL)
        parsed = json.loads(json_match.group()) if json_match else {}
    except Exception:
        parsed = {}

    return {
        "resume_summary": parsed.get("resume_summary", ""),
        "cover_letter": parsed.get("cover_letter", final_text),
        "tool_calls": tool_calls_log,
        "job_id": job_id,
    }


# ---------------------------------------------------------------------------
# Resume parsing
# ---------------------------------------------------------------------------

@app.post("/parse-resume")
async def parse_resume_endpoint(
    file: UploadFile = FastFile(...),
    user_id: int = Depends(get_user_id),
):
    """Uploads a PDF resume, parses it, saves to SQLite, and returns a summary."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    content = await file.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        profile = do_parse_resume(tmp_path, user_id=user_id)
        return {
            "name": profile.name,
            "skills": profile.skills,
            "experience_count": len(profile.experience),
            "education_count": len(profile.education),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------

@app.post("/onboarding/save")
def onboarding_save(body: OnboardingDataRequest, user_id: int = Depends(get_user_id)):
    """Saves onboarding profile fields for the authenticated user."""
    save_onboarding_data(user_id, body.model_dump())
    return {"message": "Onboarding data saved."}


@app.get("/onboarding/data", response_model=OnboardingDataResponse)
def onboarding_data(user_id: int = Depends(get_user_id)):
    """Returns onboarding profile fields for the authenticated user."""
    data = load_onboarding_data(user_id)
    if data is None:
        return OnboardingDataResponse()
    return OnboardingDataResponse(**data)


# ---------------------------------------------------------------------------
# Live scrape
# ---------------------------------------------------------------------------

@app.post("/scrape", response_model=List[ScoredJobResponse])
def scrape(body: ScrapeRequest, user_id: int = Depends(get_user_id)):
    """
    Searches RemoteOK for live job listings matching the query, saves new ones
    to the tracker, and optionally scores them with AI (score=true).
    Returns the list of saved/scored jobs.
    """
    try:
        scored = run_smart_search(
            query=body.query,
            location=body.location,
            score=body.score,
            user_id=user_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # scored only contains newly inserted jobs; also return existing DB matches.
    # search_jobs() does a phrase-LIKE which misses jobs matched by individual
    # keywords (e.g. "software engineer" won't match title "Senior Engineer").
    # Use per-word matching instead — same logic RemoteOK uses when scraping.
    from models import ScoredJob as ScoredJobModel
    scored_ids = {s.job.id for s in scored}
    words = [w.lower() for w in body.query.split() if w]
    for job in get_all_jobs(user_id):
        if job.id in scored_ids:
            continue
        searchable = f"{job.title} {job.company} {job.notes or ''}".lower()
        if any(w in searchable for w in words):
            scored_ids.add(job.id)
            scored.append(ScoredJobModel(job=job))

    return [ScoredJobResponse(**scored_job_to_dict(s)) for s in scored]


# ---------------------------------------------------------------------------
# GitHub profile
# ---------------------------------------------------------------------------

@app.get("/github", response_model=GitHubProfileResponse)
def github_get(user_id: int = Depends(get_user_id)):
    """Returns the stored GitHub profile. 404 if none has been fetched yet."""
    profile = load_github_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="No GitHub profile found.")
    return GitHubProfileResponse(**github_to_dict(profile))


@app.post("/github/fetch", response_model=GitHubProfileResponse)
def github_fetch(body: GitHubFetchRequest, user_id: int = Depends(get_user_id)):
    """
    Fetches a GitHub user's public profile via the GitHub API and saves it.
    Raises 400 if the username doesn't exist or the API call fails.
    """
    try:
        profile = fetch_github_profile(body.username, user_id=user_id)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    return GitHubProfileResponse(**github_to_dict(profile))


# ---------------------------------------------------------------------------
# Coach
# ---------------------------------------------------------------------------

@app.get("/coach/history", response_model=List[ChatMessage])
def coach_history(user_id: int = Depends(get_user_id)):
    """Returns the last 20 coach chat messages, oldest first."""
    return [ChatMessage(**m) for m in load_chat_history(limit=20, user_id=user_id)]


@app.post("/coach/chat", response_model=CoachChatResponse)
def coach_chat(body: CoachChatRequest, user_id: int = Depends(get_user_id)):
    """
    Sends a user message to Claude and returns a career coaching reply.
    Saves both the user message and the reply to chat_history.
    Uses a short system prompt (name + top 5 skills only) and passes the
    last 4 DB messages as conversation history instead of re-sending the
    full profile on every request.
    """
    import anthropic

    # Short system context — name + top 5 skills only (~20 tokens of candidate info)
    profile = build_user_profile(user_id)
    if profile:
        top5   = ", ".join(profile.all_skills[:5]) or "not listed"
        system = f"Career coach. Candidate: {profile.resume.name}. Top skills: {top5}. Be concise and practical."
    else:
        system = "Career coach helping a job seeker. Be concise and practical."

    if body.job_id:
        job = get_job_by_id(body.job_id, user_id)
        if job:
            system += f" Discussing: {job.title} at {job.company}."

    # Last 4 DB messages as conversation history — gives Claude memory without re-sending the profile
    history = load_chat_history(limit=4, user_id=user_id)
    messages = [{"role": m["role"], "content": m["message"]} for m in history]
    messages.append({"role": "user", "content": body.message})

    save_chat_message("user", body.message, user_id)

    try:
        client   = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=system,
            messages=messages,
        )
        reply = response.content[0].text
        save_chat_message("assistant", reply, user_id)
        return CoachChatResponse(reply=reply)
    except Exception as e:
        print(f"[coach/chat error] {e}")
        return CoachChatResponse(reply=f"Coach unavailable: {e}")
