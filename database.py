"""
database.py — SQLite connection and schema setup for JobNest AI.

This file has two jobs: create every table the app needs (init_db), and hand
out database connections to any file that asks (get_connection). Five tables
are managed here: jobs (the core tracker), user_profile (resume extraction),
github_profile (GitHub account data), search_sessions (live search history),
and ai_analyses (Claude job scoring results). Nothing else in the project
touches the database filename or connection config — change DB_NAME here and
it updates everywhere.
"""

import sqlite3

DB_NAME = "jobnest.db"  # Single constant — change the filename here and it updates everywhere


def init_db() -> None:
    """
    Creates all database tables if they don't exist yet.
    Safe to call every time the app starts — won't overwrite existing data.
    New tables are added here as the app grows; existing tables are never dropped.
    """
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()  # A cursor is like a pen — you use it to write SQL commands

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL,
            company    TEXT NOT NULL,
            location   TEXT,
            url        TEXT,
            status     TEXT NOT NULL DEFAULT 'Saved',
            notes      TEXT,
            date_added TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_profile (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            skills     TEXT NOT NULL DEFAULT '[]',   -- JSON array stored as text
            experience TEXT NOT NULL DEFAULT '[]',   -- JSON array of {title, company, years}
            education  TEXT NOT NULL DEFAULT '[]',   -- JSON array of {degree, institution, year}
            raw_text   TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            query      TEXT NOT NULL,       -- The job title + location searched
            run_at     TEXT NOT NULL,       -- ISO timestamp of when the search ran
            job_count  INTEGER DEFAULT 0    -- How many jobs were returned
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS github_profile (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT NOT NULL,
            repos      TEXT NOT NULL DEFAULT '[]',   -- JSON array of repo name strings
            languages  TEXT NOT NULL DEFAULT '[]',   -- JSON array of unique language strings
            topics     TEXT NOT NULL DEFAULT '[]',   -- JSON array of GitHub topic strings
            top_skills TEXT NOT NULL DEFAULT '[]',   -- JSON array — top 5 most-used languages
            updated_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_analyses (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id         INTEGER NOT NULL,
            fit_score      INTEGER DEFAULT 0,
            fit_reasons    TEXT NOT NULL DEFAULT '[]',   -- JSON array
            verdict        TEXT NOT NULL DEFAULT 'PENDING',
            confidence     REAL DEFAULT 0.0,
            skill_gaps     TEXT NOT NULL DEFAULT '[]',   -- JSON array
            skills_matched TEXT NOT NULL DEFAULT '[]',   -- JSON array
            cover_letter   TEXT NOT NULL DEFAULT '',
            created_at     TEXT NOT NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(id)     -- links analysis to its job row
        )
    """)

    conn.commit()
    conn.close()


def get_connection() -> sqlite3.Connection:
    """
    Opens and returns a connection to the database.
    Other files call this instead of knowing the database filename themselves.
    One place to change the filename — everything else just calls this function.
    """
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # Makes rows behave like dictionaries — access by name (row["title"]) not index (row[0])
    return conn
