import sqlite3

DB_NAME = "jobnest.db"  # Single constant — change the filename here and it updates everywhere


def init_db() -> None:
    """
    Creates the database file and the jobs table if they don't exist yet.
    Safe to call every time the app starts — won't overwrite existing data.
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
    """)  # IF NOT EXISTS means re-running this won't wipe your data

    conn.commit()   # Saves the changes to disk (like hitting save in a text editor)
    conn.close()    # Always close the connection when you're done — prevents file locks


def get_connection() -> sqlite3.Connection:
    """
    Opens and returns a connection to the database.
    Other files call this instead of knowing the database filename themselves.
    One place to change the filename — everything else just calls this function.
    """
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row  # Makes rows behave like dictionaries — access by name (row["title"]) not index (row[0])
    return conn
