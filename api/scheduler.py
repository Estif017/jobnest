"""
api/scheduler.py — Background job hunter for JobNest.

Runs every 24 hours per user:
  1. Reads each user's target_role from their onboarding profile.
  2. Calls run_smart_search() to fetch + score new RemoteOK listings.
  3. Emails the user for every job that scores >= FIT_THRESHOLD (7/10).

No button. No trigger. It just runs.
"""

import logging
import os
import smtplib
from email.mime.text import MIMEText
from typing import List, Optional

from apscheduler.schedulers.background import BackgroundScheduler

import datetime
from db_operations import (
    get_all_active_users,
    load_onboarding_data,
    create_notification,
    get_all_jobs,
)
from smart_scraper import run_smart_search
from models import ScoredJob

logger = logging.getLogger("jobnest.scheduler")

DEFAULT_FIT_THRESHOLD = 7   # Fallback when user has no preference set


# ---------------------------------------------------------------------------
# Email alert
# ---------------------------------------------------------------------------

def _send_alert(to_email: str, jobs: List[ScoredJob]) -> None:
    """Sends a plain-text job alert email listing all high-fit matches."""
    sender   = os.getenv("EMAIL_SENDER", "")
    password = os.getenv("EMAIL_PASSWORD", "")
    host     = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port     = int(os.getenv("SMTP_PORT", "587"))

    if not sender or not password:
        logger.warning("EMAIL_SENDER / EMAIL_PASSWORD not set — alert skipped.")
        return

    count = len(jobs)
    lines = [
        f"JobNest found {count} great match{'es' if count != 1 else ''} for you today!\n",
        "=" * 52,
    ]
    for s in jobs:
        lines.append(f"  {s.fit_score}/10  {s.verdict}  |  {s.job.title} @ {s.job.company}")
        if s.job.url:
            lines.append(f"  {s.job.url}")
        if s.reasons:
            lines.append(f"  Why: {s.reasons[0]}")
        lines.append("-" * 52)
    lines.append("\nOpen JobNest to apply: http://localhost:3000/jobs")

    msg = MIMEText("\n".join(lines), "plain")
    msg["Subject"] = f"JobNest Alert: {count} strong match{'es' if count != 1 else ''} found"
    msg["From"]    = sender
    msg["To"]      = to_email

    try:
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(sender, password)
            server.sendmail(sender, to_email, msg.as_string())
        logger.info("Alert sent to %s (%d job(s)).", to_email, count)
    except Exception as exc:
        logger.error("Failed to send alert to %s: %s", to_email, exc)


# ---------------------------------------------------------------------------
# Weekly digest email
# ---------------------------------------------------------------------------

def send_weekly_digest() -> None:
    """
    Sends each user a plain-text weekly pipeline summary.
    Runs every Sunday. Covers: total tracked, pipeline breakdown,
    overdue follow-ups, and high-fit jobs still saved (not applied).
    """
    logger.info("=== JobNest weekly digest starting ===")
    sender   = os.getenv("EMAIL_SENDER", "")
    password = os.getenv("EMAIL_PASSWORD", "")
    host     = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port     = int(os.getenv("SMTP_PORT", "587"))

    if not sender or not password:
        logger.warning("EMAIL credentials not set — digest skipped.")
        return

    users = get_all_active_users()
    today = datetime.date.today().isoformat()
    week_label = datetime.date.today().strftime("%b %d, %Y")

    for user in users:
        user_id: int = user["id"]
        email: str   = user["email"]

        jobs = get_all_jobs(user_id)
        if not jobs:
            continue

        from collections import Counter
        status_counts = Counter(j.status for j in jobs)
        total      = len(jobs)
        applied    = status_counts.get("Applied", 0)
        interviews = status_counts.get("Interviewing", 0)
        offers     = status_counts.get("Offer", 0)
        response   = round((interviews / applied) * 100) if applied > 0 else 0

        overdue = [
            j for j in jobs
            if j.follow_up_date and j.follow_up_date < today
            and j.status not in ("Offer", "Rejected")
        ]

        high_fit_unsent = [
            j for j in jobs
            if j.status == "Saved"
            and getattr(j, "fit_score", None) is not None
            and (j.fit_score or 0) >= 7  # type: ignore[operator]
        ]

        lines = [
            f"JobNest Weekly Pipeline — {week_label}",
            "=" * 52,
            "",
            "Pipeline overview:",
            f"  Total tracked:   {total}",
            f"  Applied:         {applied}",
            f"  Interviewing:    {interviews}",
            f"  Offers:          {offers}",
            f"  Response rate:   {response}%",
        ]

        if overdue:
            lines.append("")
            lines.append(f"Follow-ups overdue ({len(overdue)}):")
            for j in overdue[:5]:
                lines.append(f"  - {j.title} at {j.company} (due {j.follow_up_date})")
            if len(overdue) > 5:
                lines.append(f"  ... and {len(overdue) - 5} more")

        if high_fit_unsent:
            lines.append("")
            lines.append(f"High-fit jobs you haven't applied to yet ({len(high_fit_unsent)}):")
            for j in high_fit_unsent[:5]:
                score = getattr(j, "fit_score", "?")
                lines.append(f"  - {score}/10  {j.title} at {j.company}")
            if len(high_fit_unsent) > 5:
                lines.append(f"  ... and {len(high_fit_unsent) - 5} more")

        lines += ["", "Keep the momentum going!", "Open JobNest: http://localhost:3000/jobs"]

        msg = MIMEText("\n".join(lines), "plain")
        msg["Subject"] = f"JobNest Weekly Digest — {week_label}"
        msg["From"]    = sender
        msg["To"]      = email

        try:
            with smtplib.SMTP(host, port) as server:
                server.starttls()
                server.login(sender, password)
                server.sendmail(sender, email, msg.as_string())
            logger.info("Weekly digest sent to %s.", email)
        except Exception as exc:
            logger.error("Failed to send digest to %s: %s", email, exc)

    logger.info("=== Weekly digest complete ===")


# ---------------------------------------------------------------------------
# Core hunt logic
# ---------------------------------------------------------------------------

def hunt_new_jobs() -> None:
    """
    Background task that runs on the APScheduler interval.
    For each registered user: scrapes new jobs, scores them, alerts on high fit.
    """
    logger.info("=== JobNest hunter starting ===")

    users = get_all_active_users()
    if not users:
        logger.info("No users registered yet — nothing to hunt.")
        return

    for user in users:
        user_id: int  = user["id"]
        email: str    = user["email"]

        onboarding = load_onboarding_data(user_id)
        target_role = (onboarding.get("target_role") or "").strip() if onboarding else ""
        location    = (onboarding.get("current_location") or "").strip() if onboarding else ""

        if not target_role:
            logger.info("User %d has no target role — skipping.", user_id)
            continue

        logger.info("Hunting '%s' for user %d (%s)...", target_role, user_id, email)

        try:
            scored = run_smart_search(
                query=target_role,
                location=location,
                score=True,
                user_id=user_id,
            )
        except Exception as exc:
            logger.error("Search failed for user %d: %s", user_id, exc)
            continue

        threshold = int((onboarding or {}).get("alert_threshold", DEFAULT_FIT_THRESHOLD) or DEFAULT_FIT_THRESHOLD)
        high_fit = [s for s in scored if s.fit_score >= threshold]

        logger.info(
            "User %d: %d new job(s) found, %d high-fit (>= %d).",
            user_id, len(scored), len(high_fit), threshold,
        )

        if high_fit:
            for s in high_fit:
                create_notification(
                    user_id=user_id,
                    title=f"{s.fit_score}/10 — {s.job.title} at {s.job.company}",
                    body=s.reasons[0] if s.reasons else s.verdict,
                    type="job_alert",
                    job_id=s.job.id,
                )
            _send_alert(email, high_fit)

    logger.info("=== Hunt complete ===")


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------

def start_scheduler() -> BackgroundScheduler:
    """
    Creates, configures, and starts the APScheduler BackgroundScheduler.
    The scheduler runs in a daemon thread alongside the FastAPI server —
    no separate process needed. Returns the instance so the caller can
    shut it down cleanly on app exit.
    """
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        hunt_new_jobs,
        trigger="interval",
        hours=24,
        id="job_hunter",
        name="JobNest Daily Hunter",
        replace_existing=True,
    )
    scheduler.add_job(
        send_weekly_digest,
        trigger="cron",
        day_of_week="sun",
        hour=9,
        minute=0,
        id="weekly_digest",
        name="JobNest Weekly Digest",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("JobNest scheduler started — hunting every 24 hours, digest every Sunday 09:00 UTC.")
    return scheduler
