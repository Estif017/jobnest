"""
db_operations.py — All database read/write operations for JobNest AI.

This is the only file in the project that writes SQL. It covers five areas:
Job CRUD (add, list, get, update, delete, search), ResumeProfile persistence
(save/load the parsed resume), GitHubProfile persistence (save/load the fetched
GitHub data), JobAnalysis persistence (save/load Claude's AI scoring results),
and search session logging (record each live Indeed search run). Every other file
that needs to touch the database imports from here — nothing else writes SQL.
"""

import json
import sqlite3
from datetime import datetime
from typing import List, Optional
from database import get_connection
from models import Job, ExperienceEntry, EducationEntry, ResumeProfile, GitHubProfile, JobAnalysis

VALID_STATUSES = ("Saved", "Applied", "Interviewing", "Offer", "Rejected")  # Allowed status values


def add_job(job: Job) -> bool:
    """
    Saves a new job to the database.
    Takes a Job object and inserts it as a new row in the jobs table.
    Returns True if saved successfully, False if something went wrong.
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO jobs (title, company, location, url, status, notes, date_added)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (job.title, job.company, job.location, job.url, job.status, job.notes, job.date_added))
        # ? placeholders prevent SQL injection — values are never treated as SQL code

        conn.commit()   # Write the change to disk
        return True
    except sqlite3.Error:
        return False    # Something went wrong — tell the caller it failed
    finally:
        conn.close()    # Always runs — even if an error occurred


def get_all_jobs() -> list[Job]:
    """
    Fetches every job from the database and returns them as a list of Job objects.
    Returns an empty list if no jobs have been added yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM jobs")
    rows = cursor.fetchall()    # Retrieves all rows at once as a list
    conn.close()

    return [
        Job(
            id=row["id"],
            title=row["title"],
            company=row["company"],
            location=row["location"],
            url=row["url"],
            status=row["status"],
            notes=row["notes"],
            date_added=row["date_added"]
        )
        for row in rows     # List comprehension — builds a Job object for each row in one clean expression
    ]


def get_job_by_id(job_id: int) -> Optional[Job]:
    """
    Looks up a single job by its id number.
    Returns a Job object if found, or None if no job with that id exists.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()     # Fetches just one row — None if nothing matched
    conn.close()

    if row is None:
        return None             # No job found — tell the caller explicitly

    return Job(
        id=row["id"],
        title=row["title"],
        company=row["company"],
        location=row["location"],
        url=row["url"],
        status=row["status"],
        notes=row["notes"],
        date_added=row["date_added"]
    )


def update_job(job_id: int, **kwargs) -> bool:
    """
    Updates one or more fields of a job by its id.
    Only updates the fields you pass in — everything else stays the same.
    Returns True if updated successfully, False if the job wasn't found or something went wrong.
    """
    if not kwargs:
        return False            # Nothing to update — exit early

    conn = get_connection()
    cursor = conn.cursor()

    # Build "title = ?, status = ?" dynamically from whatever fields were passed in
    set_clause = ", ".join(f"{key} = ?" for key in kwargs)
    values = list(kwargs.values()) + [job_id]   # Values for the SET fields, then the id for WHERE

    try:
        cursor.execute(f"UPDATE jobs SET {set_clause} WHERE id = ?", values)
        conn.commit()
        return cursor.rowcount > 0  # rowcount = how many rows were changed — 0 means no job with that id existed
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def delete_job(job_id: int) -> bool:
    """
    Permanently removes a job from the database by its id.
    Returns True if a job was deleted, False if no job with that id existed.
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()
        return cursor.rowcount > 0  # 0 means no row matched that id — nothing was deleted
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get_job_by_url(url: str) -> Optional[Job]:
    """
    Looks up a single job by its exact URL.
    Used by smart_scraper to check for duplicates before saving a fetched listing.
    Returns None if no job with that URL exists.
    """
    if not url:
        return None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE url = ?", (url,))
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    return Job(
        id=row["id"],
        title=row["title"],
        company=row["company"],
        location=row["location"],
        url=row["url"],
        status=row["status"],
        notes=row["notes"],
        date_added=row["date_added"],
    )


def search_jobs(keyword: str = "", status: str = "") -> list[Job]:
    """
    Searches jobs by keyword (matches title, company, or notes) and/or status.
    Both parameters are optional — passing neither returns all jobs.
    Returns a list of matching Job objects, empty list if nothing matches.
    """
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM jobs WHERE 1=1"      # 1=1 is a safe base so we can append AND clauses cleanly
    params: list = []

    if keyword:
        query += " AND (title LIKE ? OR company LIKE ? OR notes LIKE ?)"
        like = f"%{keyword}%"                   # % is SQL wildcard — matches anything before or after the keyword
        params.extend([like, like, like])

    if status:
        query += " AND status = ?"
        params.append(status)

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [
        Job(
            id=row["id"],
            title=row["title"],
            company=row["company"],
            location=row["location"],
            url=row["url"],
            status=row["status"],
            notes=row["notes"],
            date_added=row["date_added"]
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# ResumeProfile persistence
# ---------------------------------------------------------------------------

def save_profile(profile: ResumeProfile) -> bool:
    """
    Saves (or replaces) the user's resume profile in the database.
    We only ever store one profile — the table is cleared and rewritten each time.
    Complex fields (skills, experience, education) are serialized to JSON text.
    Returns True on success, False on failure.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Serialize nested dataclass lists to JSON strings for SQLite storage
    skills_json     = json.dumps(profile.skills)
    experience_json = json.dumps([vars(e) for e in profile.experience])  # vars() converts dataclass to dict
    education_json  = json.dumps([vars(e) for e in profile.education])
    updated_at      = datetime.now().isoformat()

    try:
        cursor.execute("DELETE FROM user_profile")   # One profile at a time — wipe before rewriting
        cursor.execute("""
            INSERT INTO user_profile (name, skills, experience, education, raw_text, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (profile.name, skills_json, experience_json, education_json, profile.raw_text, updated_at))

        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_profile() -> Optional[ResumeProfile]:
    """
    Loads the most recently saved resume profile from the database.
    Deserializes the JSON fields back into proper dataclass objects.
    Returns None if no profile has been saved yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM user_profile ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    # Deserialize JSON text back into Python lists and dataclass instances
    skills     = json.loads(row["skills"])
    experience = [ExperienceEntry(**e) for e in json.loads(row["experience"])]  # ** unpacks dict into dataclass fields
    education  = [EducationEntry(**e)  for e in json.loads(row["education"])]

    return ResumeProfile(
        id=row["id"],
        name=row["name"],
        skills=skills,
        experience=experience,
        education=education,
        raw_text=row["raw_text"],
    )


# ---------------------------------------------------------------------------
# GitHubProfile persistence
# ---------------------------------------------------------------------------

def save_github_profile(profile: GitHubProfile) -> bool:
    """
    Saves (or replaces) the user's GitHub profile in the database.
    One profile at a time — table is cleared and rewritten on each call,
    matching the same single-row pattern used by save_profile().
    Returns True on success, False on failure.
    """
    conn = get_connection()
    cursor = conn.cursor()

    repos_json      = json.dumps(profile.repos)
    languages_json  = json.dumps(profile.languages)
    topics_json     = json.dumps(profile.topics)
    top_skills_json = json.dumps(profile.top_skills)
    updated_at      = datetime.now().isoformat()

    try:
        cursor.execute("DELETE FROM github_profile")    # One row at a time — wipe before rewriting
        cursor.execute("""
            INSERT INTO github_profile (username, repos, languages, topics, top_skills, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (profile.username, repos_json, languages_json, topics_json, top_skills_json, updated_at))

        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_github_profile() -> Optional[GitHubProfile]:
    """
    Loads the most recently saved GitHub profile from the database.
    Deserializes the JSON fields back into Python lists.
    Returns None if no GitHub profile has been saved yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM github_profile ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    return GitHubProfile(
        id=row["id"],
        username=row["username"],
        repos=json.loads(row["repos"]),
        languages=json.loads(row["languages"]),
        topics=json.loads(row["topics"]),
        top_skills=json.loads(row["top_skills"]),
    )


# ---------------------------------------------------------------------------
# JobAnalysis persistence
# ---------------------------------------------------------------------------

def save_analysis(analysis: JobAnalysis) -> bool:
    """
    Saves a new AI analysis result to the ai_analyses table.
    Unlike profiles, analyses are append-only — multiple analyses can exist
    for the same job_id over time. load_analysis() always returns the latest.
    Returns True on success, False on failure.
    """
    conn = get_connection()
    cursor = conn.cursor()

    fit_reasons_json   = json.dumps(analysis.fit_reasons)
    skill_gaps_json    = json.dumps(analysis.skill_gaps)
    skills_matched_json = json.dumps(analysis.skills_matched)
    created_at         = datetime.now().isoformat()

    try:
        cursor.execute("""
            INSERT INTO ai_analyses
                (job_id, fit_score, fit_reasons, verdict, confidence,
                 skill_gaps, skills_matched, cover_letter, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            analysis.job_id, analysis.fit_score, fit_reasons_json,
            analysis.verdict, analysis.confidence, skill_gaps_json,
            skills_matched_json, analysis.cover_letter, created_at,
        ))

        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_analysis(job_id: int) -> Optional[JobAnalysis]:
    """
    Loads the most recent AI analysis for a given job_id.
    Returns None if no analysis has been run for that job yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # ORDER BY id DESC so the latest analysis wins when multiple exist for the same job
    cursor.execute(
        "SELECT * FROM ai_analyses WHERE job_id = ? ORDER BY id DESC LIMIT 1",
        (job_id,),
    )
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    return JobAnalysis(
        id=row["id"],
        job_id=row["job_id"],
        fit_score=row["fit_score"],
        fit_reasons=json.loads(row["fit_reasons"]),
        verdict=row["verdict"],
        confidence=row["confidence"],
        skill_gaps=json.loads(row["skill_gaps"]),
        skills_matched=json.loads(row["skills_matched"]),
        cover_letter=row["cover_letter"],
    )


# ---------------------------------------------------------------------------
# Search session logging
# ---------------------------------------------------------------------------

def save_search_session(query: str, job_count: int) -> int:
    """
    Records one live Indeed search run in the search_sessions table.
    Called at the end of smart_scraper.run_smart_search() once the final
    job count is known. Returns the new session's id, or -1 on failure.
    """
    conn = get_connection()
    cursor = conn.cursor()

    run_at = datetime.now().isoformat()

    try:
        cursor.execute("""
            INSERT INTO search_sessions (query, run_at, job_count)
            VALUES (?, ?, ?)
        """, (query, run_at, job_count))

        conn.commit()
        return cursor.lastrowid   # SQLite id assigned to this new row
    except sqlite3.Error:
        return -1
    finally:
        conn.close()
