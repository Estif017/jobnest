"""
db_operations.py — All database read/write operations for JobNest.

This file is the only place in the project that talks directly to the database.
It provides five functions: add a job, get all jobs, get one job by id,
update a job's fields, delete a job, and search jobs by keyword or status.
Every other file imports from here instead of writing SQL themselves.
"""

import sqlite3
from database import get_connection
from models import Job

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


def get_job_by_id(job_id: int) -> Job | None:
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
