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


def add_job(job: Job, user_id: int = 1) -> bool:
    """
    Saves a new job to the database.
    Takes a Job object and inserts it as a new row in the jobs table.
    Returns True if saved successfully, False if something went wrong.
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            INSERT INTO jobs (title, company, location, url, status, notes, date_added, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (job.title, job.company, job.location, job.url, job.status, job.notes, job.date_added, user_id))
        # ? placeholders prevent SQL injection — values are never treated as SQL code

        conn.commit()   # Write the change to disk
        return True
    except sqlite3.Error:
        return False    # Something went wrong — tell the caller it failed
    finally:
        conn.close()    # Always runs — even if an error occurred


def get_all_jobs(user_id: int = 1) -> List[Job]:
    """
    Fetches every job from the database and returns them as a list of Job objects.
    Returns an empty list if no jobs have been added yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM jobs WHERE COALESCE(user_id, 1) = ?", (user_id,))
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


def get_job_by_id(job_id: int, user_id: int = 1) -> Optional[Job]:
    """
    Looks up a single job by its id number.
    Returns a Job object if found, or None if no job with that id exists.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM jobs WHERE id = ? AND COALESCE(user_id, 1) = ?", (job_id, user_id))
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


def update_job(job_id: int, user_id: int = 1, **kwargs) -> bool:
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
    values = list(kwargs.values()) + [job_id, user_id]   # Values for the SET fields, then the id/user for WHERE

    try:
        cursor.execute(f"UPDATE jobs SET {set_clause} WHERE id = ? AND COALESCE(user_id, 1) = ?", values)
        conn.commit()
        return cursor.rowcount > 0  # rowcount = how many rows were changed — 0 means no job with that id existed
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def delete_job(job_id: int, user_id: int = 1) -> bool:
    """
    Permanently removes a job from the database by its id.
    Returns True if a job was deleted, False if no job with that id existed.
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM jobs WHERE id = ? AND COALESCE(user_id, 1) = ?", (job_id, user_id))
        conn.commit()
        return cursor.rowcount > 0  # 0 means no row matched that id — nothing was deleted
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get_job_by_url(url: str, user_id: int = 1) -> Optional[Job]:
    """
    Looks up a single job by its exact URL.
    Used by smart_scraper to check for duplicates before saving a fetched listing.
    Returns None if no job with that URL exists.
    """
    if not url:
        return None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE url = ? AND COALESCE(user_id, 1) = ?", (url, user_id))
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


def search_jobs(keyword: str = "", status: str = "", user_id: int = 1) -> List[Job]:
    """
    Searches jobs by keyword (matches title, company, or notes) and/or status.
    Both parameters are optional — passing neither returns all jobs for this user.
    Returns a list of matching Job objects, empty list if nothing matches.
    """
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM jobs WHERE COALESCE(user_id, 1) = ?"      # Filter by user first
    params: list = [user_id]

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

def save_profile(profile: ResumeProfile, user_id: int = 1) -> bool:
    """
    Saves (or replaces) the user's resume profile in the database.
    Deletes only this user's profile row, then inserts a fresh one.
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
        cursor.execute("DELETE FROM user_profile WHERE COALESCE(user_id, 1) = ?", (user_id,))
        cursor.execute("""
            INSERT INTO user_profile (name, skills, experience, education, raw_text, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (profile.name, skills_json, experience_json, education_json, profile.raw_text, updated_at, user_id))

        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_profile(user_id: int = 1) -> Optional[ResumeProfile]:
    """
    Loads the most recently saved resume profile from the database.
    Deserializes the JSON fields back into proper dataclass objects.
    Returns None if no profile has been saved yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM user_profile WHERE COALESCE(user_id, 1) = ? ORDER BY id DESC LIMIT 1",
        (user_id,)
    )
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

def save_github_profile(profile: GitHubProfile, user_id: int = 1) -> bool:
    """
    Saves (or replaces) the user's GitHub profile in the database.
    Deletes only this user's profile row, then inserts a fresh one.
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
        cursor.execute("DELETE FROM github_profile WHERE COALESCE(user_id, 1) = ?", (user_id,))
        cursor.execute("""
            INSERT INTO github_profile (username, repos, languages, topics, top_skills, updated_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (profile.username, repos_json, languages_json, topics_json, top_skills_json, updated_at, user_id))

        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_github_profile(user_id: int = 1) -> Optional[GitHubProfile]:
    """
    Loads the most recently saved GitHub profile from the database.
    Deserializes the JSON fields back into Python lists.
    Returns None if no GitHub profile has been saved yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM github_profile WHERE COALESCE(user_id, 1) = ? ORDER BY id DESC LIMIT 1",
        (user_id,)
    )
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

def save_analysis(analysis: JobAnalysis, user_id: int = 1) -> bool:
    """
    Saves a new AI analysis result to the ai_analyses table.
    Unlike profiles, analyses are append-only — multiple analyses can exist
    for the same job_id over time. load_analysis() always returns the latest.
    Returns True on success, False on failure.
    """
    conn = get_connection()
    cursor = conn.cursor()

    fit_reasons_json    = json.dumps(analysis.fit_reasons)
    skill_gaps_json     = json.dumps(analysis.skill_gaps)
    skills_matched_json = json.dumps(analysis.skills_matched)
    created_at          = datetime.now().isoformat()

    try:
        cursor.execute("""
            INSERT INTO ai_analyses
                (job_id, fit_score, fit_reasons, verdict, confidence,
                 skill_gaps, skills_matched, cover_letter, created_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            analysis.job_id, analysis.fit_score, fit_reasons_json,
            analysis.verdict, analysis.confidence, skill_gaps_json,
            skills_matched_json, analysis.cover_letter, created_at, user_id,
        ))

        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_analysis(job_id: int, user_id: int = 1) -> Optional[JobAnalysis]:
    """
    Loads the most recent AI analysis for a given job_id.
    Returns None if no analysis has been run for that job yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # ORDER BY id DESC so the latest analysis wins when multiple exist for the same job
    cursor.execute(
        "SELECT * FROM ai_analyses WHERE job_id = ? AND COALESCE(user_id, 1) = ? ORDER BY id DESC LIMIT 1",
        (job_id, user_id),
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

def save_search_session(query: str, job_count: int, user_id: int = 1) -> int:
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
            INSERT INTO search_sessions (query, run_at, job_count, user_id)
            VALUES (?, ?, ?, ?)
        """, (query, run_at, job_count, user_id))

        conn.commit()
        return cursor.lastrowid   # SQLite id assigned to this new row
    except sqlite3.Error:
        return -1
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Chat history persistence
# ---------------------------------------------------------------------------

def save_chat_message(role: str, message: str, user_id: int = 1, session_id: Optional[str] = None) -> None:
    """
    Appends one message to the chat_history table.
    role must be 'user' or 'assistant' to match the Claude messages API.
    """
    conn = get_connection()
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    cursor.execute(
        "INSERT INTO chat_history (role, message, timestamp, user_id, session_id) VALUES (?, ?, ?, ?, ?)",
        (role, message, timestamp, user_id, session_id),
    )
    conn.commit()
    conn.close()


def load_chat_history(limit: int = 20, user_id: int = 1, session_id: Optional[str] = None) -> List[dict]:
    """
    Returns the last `limit` messages for a user, oldest first.
    If session_id is given, restricts to that session only.
    """
    conn = get_connection()
    cursor = conn.cursor()
    if session_id:
        cursor.execute(
            "SELECT role, message, timestamp FROM chat_history "
            "WHERE COALESCE(user_id, 1) = ? AND session_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, session_id, limit),
        )
    else:
        cursor.execute(
            "SELECT role, message, timestamp FROM chat_history "
            "WHERE COALESCE(user_id, 1) = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"role": row["role"], "message": row["message"], "timestamp": row["timestamp"]}
        for row in reversed(rows)
    ]


def get_chat_sessions(user_id: int = 1) -> List[dict]:
    """
    Returns all distinct chat sessions for a user, newest first.
    Each entry: {session_id, title, last_active}.
    Title = first user message in the session, truncated to 50 chars.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            session_id,
            (SELECT message FROM chat_history h2
             WHERE h2.session_id = h1.session_id
               AND COALESCE(h2.user_id, 1) = ?
               AND h2.role = 'user'
             ORDER BY h2.id ASC LIMIT 1) AS title,
            MAX(timestamp) AS last_active
        FROM chat_history h1
        WHERE COALESCE(user_id, 1) = ?
          AND session_id IS NOT NULL
        GROUP BY session_id
        ORDER BY last_active DESC
        LIMIT 30
        """,
        (user_id, user_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "session_id":  row["session_id"],
            "title":       (row["title"] or "New chat")[:50],
            "last_active": row["last_active"],
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Onboarding data persistence
# ---------------------------------------------------------------------------

def save_onboarding_data(user_id: int, data: dict) -> bool:
    """
    Saves onboarding fields to the user_profile row for this user.
    If no profile row exists yet, creates a minimal placeholder row.
    """
    conn = get_connection()
    cursor = conn.cursor()
    updated_at = datetime.now().isoformat()

    cursor.execute("SELECT id FROM user_profile WHERE COALESCE(user_id, 1) = ?", (user_id,))
    row = cursor.fetchone()

    fields = (
        user_id,
        data.get("target_role", ""),
        json.dumps(data.get("target_industries", [])),
        data.get("seniority_level", ""),
        json.dumps(data.get("employment_types", [])),
        data.get("work_model", ""),
        data.get("current_location", ""),
        1 if data.get("open_to_relocation") else 0,
        data.get("salary_min", 0) or 0,
        data.get("salary_max", 0) or 0,
        data.get("salary_currency", "USD"),
        data.get("years_experience", ""),
        json.dumps(data.get("top_skills_manual", [])),
        data.get("certifications", ""),
        data.get("linkedin_url", ""),
        data.get("portfolio_url", ""),
        data.get("github_username", ""),
        updated_at,
    )

    try:
        if row:
            cursor.execute("""
                UPDATE user_profile SET
                    user_id=?, target_role=?, target_industries=?, seniority_level=?,
                    employment_types=?, work_model=?, current_location=?, open_to_relocation=?,
                    salary_min=?, salary_max=?, salary_currency=?, years_experience=?,
                    top_skills_manual=?, certifications=?, linkedin_url=?, portfolio_url=?,
                    github_username=?, updated_at=?
                WHERE COALESCE(user_id, 1) = ?
            """, fields + (user_id,))
        else:
            cursor.execute("""
                INSERT INTO user_profile
                    (name, skills, experience, education, raw_text, updated_at,
                     user_id, target_role, target_industries, seniority_level,
                     employment_types, work_model, current_location, open_to_relocation,
                     salary_min, salary_max, salary_currency, years_experience,
                     top_skills_manual, certifications, linkedin_url, portfolio_url, github_username)
                VALUES ('', '[]', '[]', '[]', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (updated_at,) + fields)
        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def load_onboarding_data(user_id: int) -> Optional[dict]:
    """Loads the onboarding fields for a user. Returns None if no profile row exists."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM user_profile WHERE COALESCE(user_id, 1) = ? ORDER BY id DESC LIMIT 1",
        (user_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    def _jload(val: Optional[str]) -> list:
        try:
            return json.loads(val or "[]")
        except Exception:
            return []

    return {
        "target_role":        row["target_role"] or "",
        "target_industries":  _jload(row["target_industries"]),
        "seniority_level":    row["seniority_level"] or "",
        "employment_types":   _jload(row["employment_types"]),
        "work_model":         row["work_model"] or "",
        "current_location":   row["current_location"] or "",
        "open_to_relocation": bool(row["open_to_relocation"]),
        "salary_min":         row["salary_min"] or 0,
        "salary_max":         row["salary_max"] or 0,
        "salary_currency":    row["salary_currency"] or "USD",
        "years_experience":   row["years_experience"] or "",
        "top_skills_manual":  _jload(row["top_skills_manual"]),
        "certifications":     row["certifications"] or "",
        "linkedin_url":       row["linkedin_url"] or "",
        "portfolio_url":      row["portfolio_url"] or "",
        "github_username":    row["github_username"] or "",
        "name":               row["name"] or "",
        "skills":             _jload(row["skills"]),
    }


# ---------------------------------------------------------------------------
# User account persistence
# ---------------------------------------------------------------------------

def create_user(email: str, password_hash: Optional[str], provider: str = "email") -> int:
    """
    Creates a new user. Returns the new user's id.
    Raises sqlite3.IntegrityError if email already exists.
    password_hash is None for Google OAuth users.
    """
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    try:
        cursor.execute("""
            INSERT INTO users (email, password_hash, provider, created_at)
            VALUES (?, ?, ?, ?)
        """, (email, password_hash, provider, created_at))
        conn.commit()
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        raise   # Caller handles duplicate email
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict]:
    """Returns the user row as a plain dict, or None if not found."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[dict]:
    """Returns the user row as a plain dict, or None if not found."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Interview prep persistence
# ---------------------------------------------------------------------------

def save_interview_prep(job_id: int, user_id: int, questions: list, research: list, smart_question: str) -> int:
    """Saves a generated interview prep pack. Returns the new row id, or -1 on failure."""
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    try:
        cursor.execute(
            "INSERT INTO interview_preps (job_id, user_id, questions, research, smart_question, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (job_id, user_id, json.dumps(questions), json.dumps(research), smart_question, created_at),
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.Error:
        return -1
    finally:
        conn.close()


def load_interview_prep(job_id: int, user_id: int) -> Optional[dict]:
    """Loads the most recent interview prep for a job. Returns None if not generated yet."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM interview_preps WHERE job_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1",
        (job_id, user_id),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id":             row["id"],
        "job_id":         row["job_id"],
        "questions":      json.loads(row["questions"]),
        "research":       json.loads(row["research"]),
        "smart_question": row["smart_question"],
        "created_at":     row["created_at"],
    }


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def create_notification(
    user_id: int,
    title: str,
    body: str = "",
    type: str = "job_alert",
    job_id: Optional[int] = None,
) -> int:
    """Inserts a new notification row. Returns the new id, or -1 on failure."""
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    try:
        cursor.execute(
            "INSERT INTO notifications (user_id, type, title, body, job_id, read, created_at) "
            "VALUES (?, ?, ?, ?, ?, 0, ?)",
            (user_id, type, title, body, job_id, created_at),
        )
        conn.commit()
        return cursor.lastrowid
    except sqlite3.Error:
        return -1
    finally:
        conn.close()


def get_notifications(user_id: int, limit: int = 30) -> List[dict]:
    """Returns the most recent notifications for a user, newest first."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, type, title, body, job_id, read, created_at "
        "FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id":         row["id"],
            "type":       row["type"],
            "title":      row["title"],
            "body":       row["body"],
            "job_id":     row["job_id"],
            "read":       bool(row["read"]),
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def get_unread_count(user_id: int) -> int:
    """Returns the number of unread notifications for a user."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0",
        (user_id,),
    )
    count = cursor.fetchone()[0]
    conn.close()
    return count


def mark_notification_read(notification_id: int, user_id: int) -> bool:
    """Marks a single notification as read. Returns True on success."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?",
            (notification_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def mark_all_notifications_read(user_id: int) -> bool:
    """Marks all of a user's notifications as read."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE notifications SET read = 1 WHERE user_id = ?",
            (user_id,),
        )
        conn.commit()
        return True
    except sqlite3.Error:
        return False
    finally:
        conn.close()


def get_all_active_users() -> List[dict]:
    """
    Returns every registered user as a list of {id, email} dicts.
    Used by the scheduler to iterate users and hunt jobs on their behalf.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email FROM users ORDER BY id")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": row["id"], "email": row["email"]} for row in rows]


def set_onboarding_complete(user_id: int) -> bool:
    """Marks the user's onboarding as done. Returns True on success."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE users SET onboarding_complete = 1 WHERE id = ?",
            (user_id,),
        )
        conn.commit()
        return cursor.rowcount > 0
    except sqlite3.Error:
        return False
    finally:
        conn.close()
