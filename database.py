"""
database.py — SQLite/PostgreSQL connection and schema setup for JobNest AI.

Locally the app uses SQLite (jobnest.db). In production (Railway) it connects
to PostgreSQL via the DATABASE_URL environment variable. The public API is
identical: get_connection() returns a connection object whose cursor supports
the same execute/fetchone/fetchall/lastrowid interface regardless of the backend.

Two thin wrapper classes (_PgCursor, _PgConnection) translate the small
differences between sqlite3 and psycopg2 so the rest of the codebase never
needs to know which database is in use.
"""

import os
import sqlite3

DB_NAME = "jobnest.db"


# ---------------------------------------------------------------------------
# PostgreSQL compatibility helpers
# ---------------------------------------------------------------------------

def _is_pg() -> bool:
    return bool(os.environ.get("DATABASE_URL"))


def _ddl(sql: str) -> str:
    """Translates SQLite DDL to PostgreSQL DDL when DATABASE_URL is set."""
    if not _is_pg():
        return sql
    return sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")


class _PgCursor:
    """
    Wraps a psycopg2 RealDictCursor to behave like sqlite3.Cursor.

    Key differences handled here:
    - ? placeholders → %s
    - AUTOINCREMENT id capture via RETURNING id on every INSERT
    - rowcount and lastrowid properties
    """

    def __init__(self, pg_cursor):
        self._c = pg_cursor
        self._lastrowid = None

    def execute(self, sql: str, params=None):
        sql = sql.replace("?", "%s")
        is_insert = (
            sql.strip().upper().startswith("INSERT")
            and "RETURNING" not in sql.upper()
        )
        if is_insert:
            sql = sql.rstrip().rstrip(";") + " RETURNING id"
        if params is not None:
            self._c.execute(sql, params)
        else:
            self._c.execute(sql)
        if is_insert:
            try:
                row = self._c.fetchone()
                self._lastrowid = row["id"] if row else None
            except Exception:
                self._lastrowid = None

    @property
    def lastrowid(self):
        return self._lastrowid

    @property
    def rowcount(self):
        return self._c.rowcount

    def fetchone(self):
        return self._c.fetchone()

    def fetchall(self):
        return self._c.fetchall()


class _PgConnection:
    """Wraps a psycopg2 connection to behave like sqlite3.Connection."""

    def __init__(self, pg_conn):
        self._conn = pg_conn

    def cursor(self):
        from psycopg2.extras import RealDictCursor
        return _PgCursor(self._conn.cursor(cursor_factory=RealDictCursor))

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def get_connection():
    """
    Returns a database connection. Uses PostgreSQL when DATABASE_URL is set
    (production on Railway), otherwise SQLite (local development).
    """
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        import psycopg2
        # Railway provides postgres:// URIs; psycopg2 requires postgresql://
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)
        conn = psycopg2.connect(database_url)
        return _PgConnection(conn)
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Schema creation
# ---------------------------------------------------------------------------

def init_db() -> None:
    """
    Creates all database tables if they don't exist yet.
    Safe to call every time the app starts — won't overwrite existing data.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(_ddl("""
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
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS user_profile (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            skills     TEXT NOT NULL DEFAULT '[]',
            experience TEXT NOT NULL DEFAULT '[]',
            education  TEXT NOT NULL DEFAULT '[]',
            raw_text   TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS search_sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            query      TEXT NOT NULL,
            run_at     TEXT NOT NULL,
            job_count  INTEGER DEFAULT 0
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS github_profile (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT NOT NULL,
            repos      TEXT NOT NULL DEFAULT '[]',
            languages  TEXT NOT NULL DEFAULT '[]',
            topics     TEXT NOT NULL DEFAULT '[]',
            top_skills TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS ai_analyses (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id         INTEGER NOT NULL,
            fit_score      INTEGER DEFAULT 0,
            fit_reasons    TEXT NOT NULL DEFAULT '[]',
            verdict        TEXT NOT NULL DEFAULT 'PENDING',
            confidence     REAL DEFAULT 0.0,
            skill_gaps     TEXT NOT NULL DEFAULT '[]',
            skills_matched TEXT NOT NULL DEFAULT '[]',
            cover_letter   TEXT NOT NULL DEFAULT '',
            created_at     TEXT NOT NULL,
            FOREIGN KEY (job_id) REFERENCES jobs(id)
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS users (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            email               TEXT NOT NULL UNIQUE,
            password_hash       TEXT,
            provider            TEXT NOT NULL DEFAULT 'email',
            created_at          TEXT NOT NULL,
            onboarding_complete INTEGER NOT NULL DEFAULT 0
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS interview_preps (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id         INTEGER NOT NULL,
            user_id        INTEGER REFERENCES users(id),
            questions      TEXT NOT NULL DEFAULT '[]',
            research       TEXT NOT NULL DEFAULT '[]',
            smart_question TEXT NOT NULL DEFAULT '',
            created_at     TEXT NOT NULL
        )
    """))

    cursor.execute(_ddl("""
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
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            role      TEXT NOT NULL,
            message   TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS company_news_cache (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id     INTEGER NOT NULL UNIQUE,
            company    TEXT NOT NULL,
            bullets    TEXT NOT NULL DEFAULT '[]',
            fetched_at TEXT NOT NULL
        )
    """))

    cursor.execute(_ddl("""
        CREATE TABLE IF NOT EXISTS resume_versions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            version     INTEGER NOT NULL,
            filename    TEXT NOT NULL DEFAULT '',
            uploaded_at TEXT NOT NULL,
            name        TEXT NOT NULL DEFAULT '',
            skills      TEXT NOT NULL DEFAULT '[]',
            experience  TEXT NOT NULL DEFAULT '[]',
            education   TEXT NOT NULL DEFAULT '[]',
            raw_text    TEXT NOT NULL DEFAULT '',
            is_active   INTEGER NOT NULL DEFAULT 0
        )
    """))

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Schema migrations — adds new columns without dropping data
# ---------------------------------------------------------------------------

def migrate_db() -> None:
    """
    Adds new columns to existing tables without dropping data.
    Safe to call on every startup — skips columns that already exist.
    Works with both SQLite (PRAGMA) and PostgreSQL (information_schema).
    """
    conn = get_connection()
    cursor = conn.cursor()
    is_pg = _is_pg()

    def _add_col(table: str, col: str, defn: str) -> None:
        if is_pg:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = ? AND column_name = ?",
                (table, col),
            )
            exists = cursor.fetchone() is not None
        else:
            cursor.execute(f"PRAGMA table_info({table})")
            exists = col in [row[1] for row in cursor.fetchall()]
        if not exists:
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

    # session_id for multi-session coach chat
    _add_col("chat_history", "session_id", "TEXT")

    # email verification + password reset
    _add_col("users", "is_verified",                "INTEGER NOT NULL DEFAULT 0")
    _add_col("users", "verification_token",         "TEXT")
    _add_col("users", "verification_token_expires", "TEXT")
    _add_col("users", "reset_token",                "TEXT")
    _add_col("users", "reset_token_expires",        "TEXT")

    # account lockout after repeated failed logins
    _add_col("users", "failed_login_attempts", "INTEGER NOT NULL DEFAULT 0")
    _add_col("users", "locked_until",          "TEXT")

    # application tracking dates
    _add_col("jobs", "date_applied",   "TEXT")
    _add_col("jobs", "follow_up_date", "TEXT")

    # per-user scheduler alert threshold (minimum fit score, default 7)
    _add_col("user_profile", "alert_threshold", "INTEGER DEFAULT 7")

    # Existing users (no token) are considered verified
    cursor.execute(
        "UPDATE users SET is_verified = 1 WHERE is_verified = 0 AND verification_token IS NULL"
    )

    # Back-fill existing rows so they belong to user 1
    for tbl in ["jobs", "user_profile", "github_profile", "ai_analyses", "chat_history", "search_sessions"]:
        cursor.execute(f"UPDATE {tbl} SET user_id = 1 WHERE user_id IS NULL")

    conn.commit()
    conn.close()
