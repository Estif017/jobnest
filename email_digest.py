"""
email_digest.py — Sends a plain-text email summary of your saved job applications.

This file is optional — the rest of the app works fine without it.
It reads your email credentials from a .env file (never hardcoded),
builds a summary of all current jobs, and sends it via Gmail's SMTP server.
Run it directly: python email_digest.py
"""

import smtplib
import os
from email.mime.text import MIMEText       # Used to build a properly formatted email message
from dotenv import load_dotenv
from db_operations import get_all_jobs
from models import Job

load_dotenv()   # Reads the .env file and loads its values into os.environ

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")   # Default to Gmail if not set
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))          # 587 is the standard TLS port
EMAIL_SENDER   = os.getenv("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
EMAIL_RECEIVER = os.getenv("EMAIL_RECEIVER", "")

SUBJECT_LINE = "JobNest Daily Digest"   # Email subject — change here if needed


def _build_digest_body(jobs: list[Job]) -> str:
    """
    Builds the plain-text body of the email from a list of Job objects.
    Returns a formatted string — one block per job, separated by dashes.
    """
    if not jobs:
        return "No jobs saved yet. Time to start applying!"

    lines = [f"JobNest Digest — {len(jobs)} job(s) tracked\n", "-" * 40]

    for job in jobs:
        lines.append(f"[{job.id}] {job.title} @ {job.company}")
        lines.append(f"    Status  : {job.status}")
        lines.append(f"    Location: {job.location or 'N/A'}")
        lines.append(f"    Added   : {job.date_added}")
        lines.append(f"    Notes   : {job.notes or 'None'}")
        lines.append("-" * 40)

    return "\n".join(lines)     # Join all lines into one string with newlines between them


def _build_email(body: str) -> MIMEText:
    """
    Wraps the email body in a MIMEText object with the right headers.
    MIMEText is the standard Python way to create a sendable email message.
    """
    msg = MIMEText(body, "plain")           # "plain" means plain text, not HTML
    msg["Subject"] = SUBJECT_LINE
    msg["From"]    = EMAIL_SENDER
    msg["To"]      = EMAIL_RECEIVER
    return msg


def _check_credentials() -> bool:
    """
    Verifies that all required email credentials are set in the .env file.
    Returns False and prints a helpful message if anything is missing.
    """
    missing = [name for name, val in {
        "EMAIL_SENDER":   EMAIL_SENDER,
        "EMAIL_PASSWORD": EMAIL_PASSWORD,
        "EMAIL_RECEIVER": EMAIL_RECEIVER,
    }.items() if not val]   # Collect names of any variables that are empty strings

    if missing:
        print(f"Missing .env values: {', '.join(missing)}")
        return False

    return True


def send_digest() -> bool:
    """
    Fetches all jobs, builds the email body, and sends it via SMTP.
    Returns True if sent successfully, False if credentials are missing or sending fails.
    """
    if not _check_credentials():
        return False

    jobs = get_all_jobs()
    body = _build_digest_body(jobs)
    msg  = _build_email(body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:  # 'with' ensures the connection closes cleanly
            server.starttls()                               # Upgrades the connection to encrypted TLS
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)      # Authenticate with your credentials
            server.sendmail(EMAIL_SENDER, EMAIL_RECEIVER, msg.as_string())

        print(f"Digest sent to {EMAIL_RECEIVER}.")
        return True

    except smtplib.SMTPAuthenticationError:
        print("Authentication failed. Check your EMAIL_PASSWORD in .env.")
        return False
    except smtplib.SMTPException as e:
        print(f"Failed to send email: {e}")
        return False


if __name__ == "__main__":
    send_digest()   # Allows running this file directly: python email_digest.py
