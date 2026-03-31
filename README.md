# JobNest

A command-line tool to track job postings you find and applications you submit — all stored locally in a SQLite database.

## What problem it solves

Job hunting means juggling dozens of tabs, spreadsheets, and sticky notes. JobNest gives you a single terminal command to save a job, track its status, search your history, and optionally receive a daily email digest — no browser required.

## Installation

```bash
git clone https://github.com/your-username/jobnest.git
cd jobnest
pip install -r requirements.txt
```

## Usage

### Add a job

```bash
python main.py add --title "Software Engineer" --company "Google" --location "Remote" --url "https://careers.google.com/jobs/123" --status "Saved" --notes "Referred by a friend"
```

### List all jobs

```bash
python main.py list
```

Expected output:

```
3 job(s) found:

[1] Software Engineer @ Google
    Status   : Applied
    Location : Remote
    URL      : https://careers.google.com/jobs/123
    Added    : 2026-03-29
    Notes    : Referred by a friend
```

### Update a job

```bash
python main.py update 1 --status "Applied"
python main.py update 1 --notes "Had a great first call" --status "Interviewing"
```

### Search jobs

```bash
python main.py search --keyword "engineer"
python main.py search --status "Applied"
python main.py search --keyword "remote" --status "Saved"
```

### Delete a job

```bash
python main.py delete 1
```

You will be asked to confirm before anything is deleted.

### Send email digest (optional)

Create a `.env` file in the project root:

```
EMAIL_SENDER=your_gmail@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_RECEIVER=your_email@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

> Gmail requires an App Password — generate one at: Google Account → Security → 2-Step Verification → App Passwords.

Then run:

```bash
python email_digest.py
```

## Available statuses

`Saved` → `Applied` → `Interviewing` → `Offer` → `Rejected`

## Tech stack

| Layer | Technology |
|---|---|
| Language | Python 3.10+ |
| Database | SQLite (via built-in `sqlite3`) |
| CLI | `argparse` (built-in) |
| Email | `smtplib` (built-in) |
| Env vars | `python-dotenv` |

## Screenshot

_Demo GIF placeholder — add your own with [terminalizer](https://github.com/faressoft/terminalizer) or [asciinema](https://asciinema.org)_

## Project structure

```
jobnest/
├── main.py            # Entry point
├── cli.py             # Argparse commands
├── db_operations.py   # All database read/write logic
├── models.py          # Job dataclass
├── database.py        # SQLite connection setup
├── email_digest.py    # Optional email summary
├── requirements.txt
└── .gitignore
```
