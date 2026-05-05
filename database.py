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

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            email               TEXT NOT NULL UNIQUE,
            password_hash       TEXT,           -- NULL for Google OAuth users
            provider            TEXT NOT NULL DEFAULT 'email',
            created_at          TEXT NOT NULL,
            onboarding_complete INTEGER NOT NULL DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id),
            type       TEXT NOT NULL DEFAULT 'job_alert',
            title      TEXT NOT NULL,
            body       TEXT NOT NULL DEFAULT '',
            job_id     INTEGER,
            read       INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            role      TEXT NOT NULL,      -- 'user' or 'assistant'
            message   TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


def migrate_db() -> None:
    """
    Adds new columns to existing tables without dropping data.
    Safe to call on every startup — skips columns that already exist.
    """
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    def _add_col(table: str, col: str, defn: str) -> None:
        cursor.execute(f"PRAGMA table_info({table})")
        if col not in [row[1] for row in cursor.fetchall()]:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {defn}")

    # user_profile — onboarding fields
    _add_col("user_profile", "user_id",           "INTEGER REFERENCES users(id)")
    _add_col("user_profile", "target_role",        "TEXT DEFAULT ''")
    _add_col("user_profile", "target_industries",  "TEXT DEFAULT '[]'")
    _add_col("user_profile", "seniority_level",    "TEXT DEFAULT ''")
    _add_col("user_profile", "employment_types",   "TEXT DEFAULT '[]'")
    _add_col("user_profile", "work_model",         "TEXT DEFAULT ''")
    _add_col("user_profile", "current_location",   "TEXT DEFAULT ''")
    _add_col("user_profile", "open_to_relocation", "INTEGER DEFAULT 0")
    _add_col("user_profile", "salary_min",         "INTEGER DEFAULT 0")
    _add_col("user_profile", "salary_max",         "INTEGER DEFAULT 0")
    _add_col("user_profile", "salary_currency",    "TEXT DEFAULT 'USD'")
    _add_col("user_profile", "years_experience",   "TEXT DEFAULT ''")
    _add_col("user_profile", "top_skills_manual",  "TEXT DEFAULT '[]'")
    _add_col("user_profile", "certifications",     "TEXT DEFAULT ''")
    _add_col("user_profile", "linkedin_url",       "TEXT DEFAULT ''")
    _add_col("user_profile", "portfolio_url",      "TEXT DEFAULT ''")
    _add_col("user_profile", "github_username",    "TEXT DEFAULT ''")

    # user_id column on all other tables
    for tbl in ["jobs", "github_profile", "ai_analyses", "chat_history", "search_sessions"]:
        _add_col(tbl, "user_id", "INTEGER REFERENCES users(id)")

    # Back-fill existing rows so they belong to user 1
    for tbl in ["jobs", "user_profile", "github_profile", "ai_analyses", "chat_history", "search_sessions"]:
        cursor.execute(f"UPDATE {tbl} SET user_id = 1 WHERE user_id IS NULL")

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
