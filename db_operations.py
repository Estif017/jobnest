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


class DuplicateEmailError(Exception):
    """Raised by create_user() when the email address already exists."""

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
    except Exception:
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

    cursor.execute("""
        SELECT j.*,
               (SELECT fit_score FROM ai_analyses WHERE job_id = j.id ORDER BY id DESC LIMIT 1) AS fit_score
        FROM jobs j
        WHERE COALESCE(j.user_id, 1) = ?
    """, (user_id,))
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
            date_added=row["date_added"],
            fit_score=row["fit_score"],
            date_applied=row["date_applied"],
            follow_up_date=row["follow_up_date"],
        )
        for row in rows
    ]


def get_job_by_id(job_id: int, user_id: int = 1) -> Optional[Job]:
    """
    Looks up a single job by its id number.
    Returns a Job object if found, or None if no job with that id exists.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT j.*,
               (SELECT fit_score FROM ai_analyses WHERE job_id = j.id ORDER BY id DESC LIMIT 1) AS fit_score
        FROM jobs j
        WHERE j.id = ? AND COALESCE(j.user_id, 1) = ?
    """, (job_id, user_id))
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
        fit_score=row["fit_score"],
        date_applied=row["date_applied"],
        follow_up_date=row["follow_up_date"],
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
    except Exception:
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
    except Exception:
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

    query = """
        SELECT j.*,
               (SELECT fit_score FROM ai_analyses WHERE job_id = j.id ORDER BY id DESC LIMIT 1) AS fit_score
        FROM jobs j
        WHERE COALESCE(j.user_id, 1) = ?
    """
    params: list = [user_id]

    if keyword:
        query += " AND (j.title LIKE ? OR j.company LIKE ? OR j.notes LIKE ?)"
        like = f"%{keyword}%"
        params.extend([like, like, like])

    if status:
        query += " AND j.status = ?"
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
            date_added=row["date_added"],
            fit_score=row["fit_score"],
            date_applied=row["date_applied"],
            follow_up_date=row["follow_up_date"],
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
    except Exception:
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
# Resume versioning
# ---------------------------------------------------------------------------

def save_resume_version(profile: "ResumeProfile", user_id: int, filename: str = "") -> int:
    """
    Saves a new resume version to resume_versions, marks it active, and
    deactivates all previous versions for this user. Returns the new row id.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS cnt FROM resume_versions WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    version_num = (row["cnt"] if row else 0) + 1
    skills_json     = json.dumps(profile.skills)
    experience_json = json.dumps([vars(e) for e in profile.experience])
    education_json  = json.dumps([vars(e) for e in profile.education])
    uploaded_at     = datetime.now().isoformat()
    cursor.execute("UPDATE resume_versions SET is_active = 0 WHERE user_id = ?", (user_id,))
    cursor.execute("""
        INSERT INTO resume_versions
            (user_id, version, filename, uploaded_at, name, skills, experience, education, raw_text, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    """, (user_id, version_num, filename, uploaded_at,
          profile.name, skills_json, experience_json, education_json, profile.raw_text))
    new_id = cursor.lastrowid or 0
    conn.commit()
    conn.close()
    return new_id


def get_resume_versions(user_id: int) -> List[dict]:
    """Returns all resume versions for a user, newest first, as plain dicts."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, version, filename, uploaded_at, name, is_active, skills
        FROM resume_versions WHERE user_id = ? ORDER BY version DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        try:
            skills_count = len(json.loads(r["skills"] or "[]"))
        except Exception:
            skills_count = 0
        result.append({
            "id":          r["id"],
            "version":     r["version"],
            "filename":    r["filename"],
            "uploaded_at": r["uploaded_at"],
            "name":        r["name"],
            "is_active":   bool(r["is_active"]),
            "skills_count": skills_count,
        })
    return result


def activate_resume_version(version_id: int, user_id: int) -> bool:
    """
    Sets the given version as active, deactivates others, and overwrites the
    user_profile row with this version's parsed resume data. Returns False if
    the version does not exist or belongs to a different user.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM resume_versions WHERE id = ? AND user_id = ?", (version_id, user_id)
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    cursor.execute("UPDATE resume_versions SET is_active = 0 WHERE user_id = ?", (user_id,))
    cursor.execute("UPDATE resume_versions SET is_active = 1 WHERE id = ?", (version_id,))
    updated_at = datetime.now().isoformat()
    cursor.execute(
        "UPDATE user_profile SET name = ?, skills = ?, experience = ?, education = ?, raw_text = ?, updated_at = ? "
        "WHERE COALESCE(user_id, 1) = ?",
        (row["name"], row["skills"], row["experience"], row["education"], row["raw_text"], updated_at, user_id),
    )
    conn.commit()
    conn.close()
    return True


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
    except Exception:
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
    except Exception:
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
    except Exception:
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


_LEGACY_SESSION = "legacy"


def load_chat_history(limit: int = 20, user_id: int = 1, session_id: Optional[str] = None) -> List[dict]:
    """
    Returns the last `limit` messages for a user, oldest first.
    session_id="legacy" loads messages that pre-date the sessions feature (NULL session_id).
    """
    conn = get_connection()
    cursor = conn.cursor()
    if session_id == _LEGACY_SESSION:
        cursor.execute(
            "SELECT role, message, timestamp FROM chat_history "
            "WHERE COALESCE(user_id, 1) = ? AND session_id IS NULL ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        )
    elif session_id:
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
    Includes a synthetic 'legacy' entry for messages that pre-date the sessions feature.
    Each entry: {session_id, title, last_active}.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # Named sessions
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
    rows = list(cursor.fetchall())

    # Legacy messages (NULL session_id) — surface as one entry at the bottom
    cursor.execute(
        """
        SELECT
            (SELECT message FROM chat_history h2
             WHERE h2.session_id IS NULL AND COALESCE(h2.user_id, 1) = ? AND h2.role = 'user'
             ORDER BY h2.id ASC LIMIT 1) AS title,
            MAX(timestamp) AS last_active,
            COUNT(*) AS cnt
        FROM chat_history
        WHERE COALESCE(user_id, 1) = ? AND session_id IS NULL
        """,
        (user_id, user_id),
    )
    legacy = cursor.fetchone()
    conn.close()

    sessions = [
        {
            "session_id":  row["session_id"],
            "title":       (row["title"] or "New chat")[:50],
            "last_active": row["last_active"],
        }
        for row in rows
    ]

    if legacy and legacy["cnt"]:
        sessions.append({
            "session_id":  _LEGACY_SESSION,
            "title":       (legacy["title"] or "Earlier conversations")[:50],
            "last_active": legacy["last_active"],
        })

    return sessions


def delete_chat_session(session_id: str, user_id: int = 1) -> None:
    """Deletes all chat_history rows for a given session_id and user."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM chat_history WHERE session_id = ? AND COALESCE(user_id, 1) = ?",
        (session_id, user_id),
    )
    conn.commit()
    conn.close()


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
        int(data.get("alert_threshold", 7) or 7),
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
                    github_username=?, alert_threshold=?, updated_at=?
                WHERE COALESCE(user_id, 1) = ?
            """, fields + (user_id,))
        else:
            cursor.execute("""
                INSERT INTO user_profile
                    (name, skills, experience, education, raw_text, updated_at,
                     user_id, target_role, target_industries, seniority_level,
                     employment_types, work_model, current_location, open_to_relocation,
                     salary_min, salary_max, salary_currency, years_experience,
                     top_skills_manual, certifications, linkedin_url, portfolio_url,
                     github_username, alert_threshold)
                VALUES ('', '[]', '[]', '[]', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (updated_at,) + fields)
        conn.commit()
        return True
    except Exception:
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
        "alert_threshold":    row["alert_threshold"] if row["alert_threshold"] is not None else 7,
        "name":               row["name"] or "",
        "skills":             _jload(row["skills"]),
    }


# ---------------------------------------------------------------------------
# User account persistence
# ---------------------------------------------------------------------------

def create_user(
    email: str,
    password_hash: Optional[str],
    provider: str = "email",
    is_verified: bool = False,
    verification_token: Optional[str] = None,
    verification_token_expires: Optional[str] = None,
) -> int:
    """
    Creates a new user. Returns the new user's id.
    Raises sqlite3.IntegrityError if email already exists.
    password_hash is None for OAuth users. OAuth users pass is_verified=True.
    """
    conn = get_connection()
    cursor = conn.cursor()
    created_at = datetime.now().isoformat()
    try:
        cursor.execute("""
            INSERT INTO users (email, password_hash, provider, created_at,
                               is_verified, verification_token, verification_token_expires)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (email, password_hash, provider, created_at,
              1 if is_verified else 0, verification_token, verification_token_expires))
        conn.commit()
        return cursor.lastrowid
    except Exception as exc:
        exc_name = type(exc).__name__
        if "IntegrityError" in exc_name or "UniqueViolation" in exc_name:
            raise DuplicateEmailError("Email already exists") from exc
        raise
    finally:
        conn.close()


def set_verification_token(user_id: int, token: str, expires: str) -> None:
    """Saves a verification token + expiry for a user."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?",
        (token, expires, user_id),
    )
    conn.commit()
    conn.close()


def get_user_by_verification_token(token: str) -> Optional[dict]:
    """Returns the user row if the token exists, or None."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE verification_token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def mark_user_verified(user_id: int) -> None:
    """Sets is_verified=1. Keeps the token so a second hit on the same link still returns success."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_verified = 1 WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()


def set_reset_token(user_id: int, token: str, expires: str) -> None:
    """Saves a password-reset token + expiry for a user."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?",
        (token, expires, user_id),
    )
    conn.commit()
    conn.close()


def get_user_by_reset_token(token: str) -> Optional[dict]:
    """Returns the user row if the reset token exists, or None."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE reset_token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def complete_password_reset(user_id: int, new_hash: str) -> None:
    """Sets the new password hash and clears the reset token."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
        (new_hash, user_id),
    )
    conn.commit()
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
    except Exception:
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
    except Exception:
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
        "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read = 0",
        (user_id,),
    )
    count = cursor.fetchone()["cnt"]
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
    except Exception:
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
    except Exception:
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
    except Exception:
        return False
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Account lockout helpers
# ---------------------------------------------------------------------------

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES     = 15


def record_failed_login(user_id: int) -> None:
    """
    Increments the failed attempt counter. When it hits MAX_FAILED_ATTEMPTS,
    sets locked_until to 15 minutes from now.
    """
    from datetime import datetime, timedelta
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?",
        (user_id,),
    )
    cursor.execute("SELECT failed_login_attempts FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if row and row["failed_login_attempts"] >= MAX_FAILED_ATTEMPTS:
        locked_until = (datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        cursor.execute(
            "UPDATE users SET locked_until = ? WHERE id = ?",
            (locked_until, user_id),
        )
    conn.commit()
    conn.close()


def reset_failed_logins(user_id: int) -> None:
    """Clears the failed attempt counter and any lockout after a successful login."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
        (user_id,),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Company news cache
# ---------------------------------------------------------------------------

_NEWS_TTL_HOURS = 24


def get_cached_company_news(job_id: int) -> Optional[List[str]]:
    """Returns cached bullets if present and younger than 24 hours, otherwise None."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT bullets, fetched_at FROM company_news_cache WHERE job_id = ?", (job_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    age_hours = (datetime.utcnow() - datetime.fromisoformat(row["fetched_at"])).total_seconds() / 3600
    if age_hours > _NEWS_TTL_HOURS:
        return None

    return json.loads(row["bullets"])


def save_company_news_cache(job_id: int, company: str, bullets: List[str]) -> None:
    """Upserts the company news cache for a job."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO company_news_cache (job_id, company, bullets, fetched_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            company    = excluded.company,
            bullets    = excluded.bullets,
            fetched_at = excluded.fetched_at
    """, (job_id, company, json.dumps(bullets), datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()
