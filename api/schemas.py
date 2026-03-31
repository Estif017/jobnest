"""
api/schemas.py — Pydantic request and response models for the JobNest API.

Every Python dataclass that crosses the HTTP boundary has a Pydantic equivalent
here. Field names are kept identical to the dataclasses so the frontend TypeScript
interfaces can mirror them 1-to-1 with no translation layer. Converter helpers
at the bottom of this file turn dataclass instances into plain dicts that Pydantic
can serialize — no ORM, no magic, just explicit mappings.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class JobCreate(BaseModel):
    """Fields accepted when creating a new job. title and company are required."""
    title:    str
    company:  str
    location: str = ""
    url:      str = ""
    status:   str = "Saved"
    notes:    str = ""


class JobUpdate(BaseModel):
    """All fields optional — only the ones provided get sent to update_job()."""
    title:    Optional[str] = None
    company:  Optional[str] = None
    location: Optional[str] = None
    url:      Optional[str] = None
    status:   Optional[str] = None
    notes:    Optional[str] = None


class ScrapeRequest(BaseModel):
    """Body for the /scrape endpoint. score=False by default (AI key may not be set)."""
    query:    str
    location: str
    score:    bool = False


class GitHubFetchRequest(BaseModel):
    """Body for POST /github/fetch."""
    username: str


class CoachChatRequest(BaseModel):
    """Body for POST /coach/chat."""
    message: str
    job_id: Optional[int] = None   # Optional job context to include in the prompt


class CoachChatResponse(BaseModel):
    """Response from POST /coach/chat."""
    reply: str


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class JobResponse(BaseModel):
    """Mirrors the Job dataclass exactly."""
    id:         int
    title:      str
    company:    str
    location:   str
    url:        str
    status:     str
    notes:      str
    date_added: str


class JobAnalysisResponse(BaseModel):
    """Mirrors the JobAnalysis dataclass exactly."""
    id:             int
    job_id:         int
    fit_score:      int
    fit_reasons:    List[str]
    verdict:        str
    confidence:     float
    skill_gaps:     List[str]
    skills_matched: List[str]
    cover_letter:   str


class GitHubProfileResponse(BaseModel):
    """Mirrors the GitHubProfile dataclass exactly."""
    id:         int
    username:   str
    repos:      List[str]
    languages:  List[str]
    topics:     List[str]
    top_skills: List[str]


class ScoredJobResponse(BaseModel):
    """Mirrors the ScoredJob dataclass. job is nested."""
    id:         int
    job:        JobResponse
    fit_score:  int
    reasons:    List[str]
    verdict:    str
    session_id: str


class DashboardStats(BaseModel):
    """Aggregated counts returned by GET /dashboard/stats."""
    total_jobs:      int
    applied_count:   int
    interview_count: int
    top_statuses:    Dict[str, int]


# ---------------------------------------------------------------------------
# Converter helpers — dataclass → dict → Pydantic
# ---------------------------------------------------------------------------

def job_to_dict(job) -> dict:
    """Converts a Job dataclass instance to a plain dict for JobResponse."""
    return {
        "id":         job.id,
        "title":      job.title,
        "company":    job.company,
        "location":   job.location or "",
        "url":        job.url or "",
        "status":     job.status,
        "notes":      job.notes or "",
        "date_added": job.date_added,
    }


def analysis_to_dict(a) -> dict:
    """Converts a JobAnalysis dataclass instance to a plain dict for JobAnalysisResponse."""
    return {
        "id":             a.id,
        "job_id":         a.job_id,
        "fit_score":      a.fit_score,
        "fit_reasons":    a.fit_reasons,
        "verdict":        a.verdict,
        "confidence":     a.confidence,
        "skill_gaps":     a.skill_gaps,
        "skills_matched": a.skills_matched,
        "cover_letter":   a.cover_letter,
    }


def github_to_dict(p) -> dict:
    """Converts a GitHubProfile dataclass instance to a plain dict for GitHubProfileResponse."""
    return {
        "id":         p.id,
        "username":   p.username,
        "repos":      p.repos,
        "languages":  p.languages,
        "topics":     p.topics,
        "top_skills": p.top_skills,
    }


def scored_job_to_dict(s) -> dict:
    """Converts a ScoredJob dataclass (with nested Job) to a plain dict."""
    return {
        "id":         s.id,
        "job":        job_to_dict(s.job),
        "fit_score":  s.fit_score,
        "reasons":    s.reasons,
        "verdict":    s.verdict,
        "session_id": s.session_id,
    }
