import sqlite3
from database import get_connection
from models import Job


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
