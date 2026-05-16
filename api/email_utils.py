"""
api/email_utils.py — Transactional email helpers for JobNest.

All send_* functions are fire-and-forget: they spawn a daemon thread so the
HTTP response returns immediately — email latency never blocks the caller.

Uses Resend (https://resend.com) via HTTP API — works on Railway where
outbound SMTP (port 587) is blocked. Falls back gracefully if not configured.
"""

import logging
import os
import threading
import urllib.request
import urllib.error
import json

logger = logging.getLogger(__name__)


def _send_html_email(to_email: str, subject: str, html_body: str) -> None:
    """Sends a single HTML email via Resend HTTP API. Never raises."""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    sender  = os.getenv("EMAIL_SENDER", "onboarding@resend.dev").strip()

    if not api_key:
        logger.warning("RESEND_API_KEY not set — email skipped.")
        return

    payload = json.dumps({
        "from":    sender,
        "to":      [to_email],
        "subject": subject,
        "html":    html_body,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
            "User-Agent":    "JobNest/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Email '%s' sent to %s (status %s).", subject, to_email, resp.status)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.error("Resend error sending to %s: %s %s", to_email, exc.code, body)
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
