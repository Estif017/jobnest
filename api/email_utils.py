"""
api/email_utils.py — Transactional email helpers for JobNest.

All send_* functions are fire-and-forget: they spawn a daemon thread so the
HTTP response returns immediately — SMTP latency never blocks the caller.
"""

import logging
import os
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

SMTP_TIMEOUT = 10  # seconds — fail fast instead of hanging forever


def _send_html_email(to_email: str, subject: str, html_body: str) -> None:
    """Sends a single HTML email via SMTP with a hard timeout. Never raises."""
    sender   = os.getenv("EMAIL_SENDER", "")
    password = os.getenv("EMAIL_PASSWORD", "")
    host     = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port     = int(os.getenv("SMTP_PORT", "587"))

    if not sender or not password:
        logger.warning("EMAIL_SENDER / EMAIL_PASSWORD not set — email skipped.")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = sender
    msg["To"]      = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT) as server:
            server.starttls()
            server.login(sender, password)
            server.sendmail(sender, to_email, msg.as_string())
        logger.info("Email '%s' sent to %s.", subject, to_email)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)


def _send_async(to_email: str, subject: str, html_body: str) -> None:
    """Spawns a daemon thread to send email without blocking the HTTP response."""
    t = threading.Thread(
        target=_send_html_email,
        args=(to_email, subject, html_body),
        daemon=True,
    )
    t.start()


def send_verification_email(to_email: str, token: str) -> None:
    """Sends the account-verification email asynchronously."""
    base_url = os.getenv("NEXTAUTH_URL", "http://localhost:3000")
    link = f"{base_url}/auth/verify-email?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#060b14;color:#e2e8f0;border-radius:12px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:700;color:#fff;">JobNest</span>
        <span style="font-size:13px;color:#475569;margin-left:8px;">Career Copilot</span>
      </div>
      <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">Verify your email address</h2>
      <p style="font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 24px;">
        Thanks for signing up! Click the button below to confirm your address and activate your account.
        This link expires in <strong style="color:#e2e8f0;">24 hours</strong>.
      </p>
      <a href="{link}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
        Verify Email Address
      </a>
      <p style="font-size:12px;color:#475569;margin-top:24px;">
        If you didn't create a JobNest account, you can safely ignore this email.
      </p>
    </div>
    """
    _send_async(to_email, "Verify your JobNest email address", html)


def send_password_reset_email(to_email: str, token: str) -> None:
    """Sends the password-reset email asynchronously."""
    base_url = os.getenv("NEXTAUTH_URL", "http://localhost:3000")
    link = f"{base_url}/auth/reset-password?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#060b14;color:#e2e8f0;border-radius:12px;">
      <div style="margin-bottom:24px;">
        <span style="font-size:22px;font-weight:700;color:#fff;">JobNest</span>
        <span style="font-size:13px;color:#475569;margin-left:8px;">Career Copilot</span>
      </div>
      <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">Reset your password</h2>
      <p style="font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 24px;">
        We received a request to reset your JobNest password. Click below to choose a new one.
        This link expires in <strong style="color:#e2e8f0;">1 hour</strong>.
      </p>
      <a href="{link}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
        Reset Password
      </a>
      <p style="font-size:12px;color:#475569;margin-top:24px;">
        If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
    """
    _send_async(to_email, "Reset your JobNest password", html)
