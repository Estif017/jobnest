# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
python main.py <command> [options]

# Examples
python main.py add --title "Engineer" --company "Google" --location "Remote" --url "..." --status "Saved" --notes "..."
python main.py list
python main.py update 1 --status "Applied"
python main.py search --keyword "engineer" --status "Applied"
python main.py delete 1

# Parse a resume PDF (saves to SQLite automatically)
python resume_parser.py path/to/resume.pdf

# Send email digest
python email_digest.py
```

## Installing dependencies

```bash
pip install -r requirements.txt
```

Requires Python 3.10+. No test suite exists yet.

## Architecture

The app is a CLI job-application tracker backed by SQLite. Data flows in one direction:

```
main.py → cli.py → db_operations.py → database.py → jobnest.db
```

**Layer responsibilities:**
- `database.py` — sole owner of `DB_NAME` and `get_connection()`. All other files call this; nothing else touches the SQLite filename.
- `models.py` — all dataclasses live here. Every object that flows through the system is defined in this one file. New models go here.
- `db_operations.py` — the only file that writes SQL. Covers Job CRUD, `ResumeProfile` save/load, and search. `update_job()` builds SET clauses dynamically from `**kwargs`.
- `cli.py` — argparse setup and handler functions. `build_parser()` is separated from `run_cli()` so the parser can be tested independently.
- `resume_parser.py` — extracts name/skills/experience/education from a PDF using `pdfplumber` + regex heuristics, then auto-saves via `save_profile()`. Skills are matched against a hardcoded `SKILLS_KEYWORDS` list.
- `email_digest.py` — optional standalone script; reads credentials from `.env` via `python-dotenv`, sends via Gmail SMTP.

**Key data models in `models.py`:**
- `Job` — core tracker object (title, company, location, url, status, notes, date_added, id)
- `ResumeProfile` — parsed PDF output (name, skills list, ExperienceEntry list, EducationEntry list, raw_text)
- `UserProfile` — merge of `ResumeProfile` + `GitHubProfile` (built by a future `github_parser.py`)
- `ScoredJob` / `JobAnalysis` — AI scoring outputs (fit_score 1-10, verdict: APPLY/SKIP/RED FLAG, skill_gaps, cover_letter)

**Database tables:** `jobs`, `user_profile` (single row, replaced on each save), `search_sessions`, `ai_analyses`

**Valid job statuses:** `Saved` → `Applied` → `Interviewing` → `Offer` → `Rejected`

**JSON serialization pattern:** Complex fields (skills, experience, education) are stored as JSON strings in SQLite and deserialized back to dataclass instances via `**dict` unpacking in `load_profile()`.

## Planned modules (not yet built)

`github_parser.py` (populates `GitHubProfile`), AI scoring/coaching modules (populate `ScoredJob` and `JobAnalysis`), and smart job scraping (populates `search_sessions`). The `anthropic` package in `requirements.txt` is reserved for these AI features.

## Email digest setup

Create a `.env` file in the project root:
```
EMAIL_SENDER=your_gmail@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_RECEIVER=your_email@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```
Gmail requires an App Password (Google Account → Security → 2-Step Verification → App Passwords).
