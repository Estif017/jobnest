"""
models.py — All dataclasses (blueprints) for JobNest AI.

Every object that flows through this system is defined here.
Job is the original tracker model. The new models (ExperienceEntry,
EducationEntry, ResumeProfile, GitHubProfile, UserProfile, ScoredJob,
JobAnalysis) power the AI features. All other files import from here.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import List


@dataclass
class Job:
    """
    Represents a single job application.
    Think of this as a blueprint — every job in the system will have these exact fields.
    Using a dataclass means Python writes __init__ and __repr__ for us automatically.
    """
    title: str                                          # Job title e.g. "Software Engineer"
    company: str                                        # Company name e.g. "Google"
    location: str = ""                                  # Optional — empty string if not provided
    url: str = ""                                       # Optional — link to the job posting
    status: str = "Saved"                               # Default status when first added
    notes: str = ""                                     # Optional — any personal notes
    date_added: str = field(default_factory=lambda: date.today().isoformat())  # Auto-fills today's date as "YYYY-MM-DD"
    id: int = 0                                         # 0 means not yet saved to the database; SQLite will assign a real id


@dataclass
class ExperienceEntry:
    """
    Represents one job from your work history extracted from your resume.
    'years' is a freeform string because resume formats vary wildly — "2020-2023", "Jan 2020 - Present", etc.
    """
    title: str          # Job title held e.g. "Backend Engineer"
    company: str        # Company where the role was held
    years: str = ""     # Duration string extracted as-is from the resume


@dataclass
class EducationEntry:
    """
    Represents one education record extracted from the resume.
    """
    degree: str         # e.g. "Bachelor of Science in Computer Science"
    institution: str    # e.g. "UCLA"
    year: str = ""      # Graduation year or range, extracted as-is


@dataclass
class ResumeProfile:
    """
    The structured data extracted from a PDF resume.
    This is the output of resume_parser.py — one object that holds everything
    we learned about the user from their resume.
    """
    name: str
    skills: List[str] = field(default_factory=list)            # Flat list of skill keywords found
    experience: List[ExperienceEntry] = field(default_factory=list)
    education: List[EducationEntry] = field(default_factory=list)
    raw_text: str = ""                                          # Full extracted PDF text — kept for AI use later
    id: int = 0                                                 # 0 = not yet saved to database


@dataclass
class GitHubProfile:
    """
    Data pulled from a user's public GitHub account.
    Built by github_parser.py in Module 2.
    """
    username: str
    repos: List[str] = field(default_factory=list)             # List of public repo names
    languages: List[str] = field(default_factory=list)         # All languages used across repos
    topics: List[str] = field(default_factory=list)            # GitHub topics/tags on repos
    top_skills: List[str] = field(default_factory=list)        # Derived from most-used languages
    id: int = 0


@dataclass
class UserProfile:
    """
    The merged identity of the user — resume data + GitHub data combined.
    This is what the AI modules receive as context for scoring, coaching, and gap analysis.
    """
    resume: ResumeProfile
    github: GitHubProfile
    all_skills: List[str] = field(default_factory=list)        # Union of resume skills + GitHub languages


@dataclass
class ScoredJob:
    """
    A job posting that has been scored against the user's profile.
    Wraps a Job with an AI-assigned fit score and reasons.
    Built by smart_scraper.py and ai_coach.py.
    """
    job: Job
    fit_score: int = 0                                          # 1-10 — how well the job matches the user
    reasons: List[str] = field(default_factory=list)           # Bullet-point reasons for the score
    verdict: str = "PENDING"                                    # APPLY / SKIP / RED FLAG
    session_id: str = ""                                        # Links this result to a search session
    id: int = 0


@dataclass
class JobAnalysis:
    """
    The result of AI analysis on a single job posting.
    Built by ai_coach.py — covers ghost job detection, skill gaps, and cover letter.
    """
    job_id: int
    fit_score: int = 0
    fit_reasons: List[str] = field(default_factory=list)
    verdict: str = "PENDING"                                    # APPLY / SKIP / RED FLAG
    confidence: float = 0.0                                     # 0.0 - 1.0
    skill_gaps: List[str] = field(default_factory=list)         # Skills the user is missing
    skills_matched: List[str] = field(default_factory=list)     # Skills the user already has
    cover_letter: str = ""
    id: int = 0
