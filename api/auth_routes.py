"""
api/auth_routes.py — Authentication endpoints for JobNest.

Handles registration (with email verification), login (blocks unverified accounts),
Google/GitHub OAuth upsert (auto-verified), onboarding completion, password change,
email verification, and password reset flows.
"""

import re
import secrets
from datetime import datetime, timedelta

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request

from api.email_utils import send_verification_email, send_password_reset_email
from api.limiter import limiter
from api.schemas import (
    RegisterRequest, LoginRequest, GoogleAuthRequest, GithubAuthRequest,
    AuthResponse, OnboardingCompleteRequest, ChangePasswordRequest,
    ResendVerificationRequest, ForgotPasswordRequest, ResetPasswordRequest,
)
from api.auth_middleware import get_authenticated_user
from db_operations import (
    create_user, get_user_by_email, get_user_by_id, set_onboarding_complete,
    set_verification_token, get_user_by_verification_token, mark_user_verified,
    set_reset_token, get_user_by_reset_token, complete_password_reset,
    record_failed_login, reset_failed_logins, DuplicateEmailError,
)

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

_SPECIAL = re.compile(r"[!@#$%^&*()\-_=+\[\]{}|;:',.<>?/`~\"\\]")


def _validate_password_strength(password: str) -> None:
    """Raises HTTPException 422 if password doesn't meet all strength criteria."""
    missing = []
    if len(password) < 8:
        missing.append("at least 8 characters")
    if not re.search(r"[A-Z]", password):
        missing.append("an uppercase letter")
    if not re.search(r"[a-z]", password):
        missing.append("a lowercase letter")
    if not re.search(r"[0-9]", password):
        missing.append("a number")
    if not _SPECIAL.search(password):
        missing.append("a special character (!@#$%^&*...)")
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Password must include: {', '.join(missing)}.",
        )


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@router.post("/register", status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest):
    """
    Creates a new email/password account. Sends a verification email.
    The account is created with is_verified=False until the link is clicked.
    """
    if not EMAIL_RE.match(body.email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    _validate_password_strength(body.password)

    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    token   = secrets.token_urlsafe(32)
    expires = (datetime.utcnow() + timedelta(hours=24)).isoformat()

    try:
        create_user(
            email=body.email.lower().strip(),
            password_hash=pw_hash,
            provider="email",
            is_verified=False,
            verification_token=token,
            verification_token_expires=expires,
        )
    except DuplicateEmailError:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    send_verification_email(body.email.lower().strip(), token)
    return {"message": "Account created. Please check your email to verify your address."}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest):
    """
    Verifies email + password and returns user info.
    Returns 423 if the account is temporarily locked after too many failures.
    Returns 403 if the account exists but email is not yet verified.
    Called by the NextAuth Credentials provider's authorize() function and
    directly by the login page (to surface these errors before calling signIn).
    """
    from datetime import datetime

    user = get_user_by_email(body.email.lower().strip())

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if user["provider"] in ("google", "github"):
        provider_label = user["provider"].title()
        raise HTTPException(
            status_code=400,
            detail=f"This account uses {provider_label} sign-in. Please use 'Continue with {provider_label}'.",
        )

    # Check lockout before touching the password — avoids timing leak
    locked_until = user.get("locked_until")
    if locked_until:
        lock_dt = datetime.fromisoformat(locked_until)
        if datetime.utcnow() < lock_dt:
            remaining = int((lock_dt - datetime.utcnow()).total_seconds() // 60) + 1
            raise HTTPException(
                status_code=423,
                detail=f"Account locked due to too many failed attempts. Try again in {remaining} minute{'s' if remaining != 1 else ''}.",
            )

    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        record_failed_login(user["id"])
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.get("is_verified", 1):
        raise HTTPException(status_code=403, detail="Please verify your email before signing in.")

    # Successful login — clear any previous lockout state
    reset_failed_logins(user["id"])

    return AuthResponse(
        user_id=user["id"],
        email=user["email"],
        onboarding_complete=bool(user["onboarding_complete"]),
        provider=user["provider"],
    )


# ---------------------------------------------------------------------------
# Google OAuth upsert
# ---------------------------------------------------------------------------

@router.post("/google", response_model=AuthResponse)
def google_auth(body: GoogleAuthRequest):
    """
    Called by NextAuth's jwt() callback after a successful Google sign-in.
    Creates the user in our DB if they don't exist yet (upsert). OAuth users
    are always marked verified — Google already confirmed the email.
    """
    email = body.email.lower().strip()
    user  = get_user_by_email(email)

    if user is None:
        user_id = create_user(email=email, password_hash=None, provider="google", is_verified=True)
        user = get_user_by_id(user_id)

    return AuthResponse(
        user_id=user["id"],
        email=user["email"],
        onboarding_complete=bool(user["onboarding_complete"]),
        provider=user["provider"],
    )


# ---------------------------------------------------------------------------
# GitHub OAuth upsert
# ---------------------------------------------------------------------------

@router.post("/github", response_model=AuthResponse)
def github_auth(body: GithubAuthRequest):
    """
    Called by NextAuth's jwt() callback after a successful GitHub sign-in.
    Creates the user in our DB if they don't exist yet (upsert). OAuth users
    are always marked verified — GitHub already confirmed the email.
    """
    if not body.email:
        raise HTTPException(
            status_code=422,
            detail="GitHub account has no public email. Please add one in GitHub settings.",
        )
    email = body.email.lower().strip()
    user  = get_user_by_email(email)

    if user is None:
        user_id = create_user(email=email, password_hash=None, provider="github", is_verified=True)
        user = get_user_by_id(user_id)

    return AuthResponse(
        user_id=user["id"],
        email=user["email"],
        onboarding_complete=bool(user["onboarding_complete"]),
        provider=user["provider"],
    )


# ---------------------------------------------------------------------------
# Verify email
# ---------------------------------------------------------------------------

@router.get("/verify-email")
def verify_email(token: str):
    """
    Marks the user's account as verified when they click the link in the email.
    Idempotent: hitting the same link twice both return 200 so React StrictMode
    double-invocation never shows a spurious error screen.
    """
    user = get_user_by_verification_token(token)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

    # Already verified (e.g. second call from StrictMode or double-click) — return success
    if user.get("is_verified", 0):
        return {"message": "Email verified. You can now sign in."}

    expires = user.get("verification_token_expires")
    if expires and datetime.utcnow() > datetime.fromisoformat(expires):
        raise HTTPException(status_code=400, detail="Verification link has expired. Please request a new one.")

    mark_user_verified(user["id"])
    return {"message": "Email verified. You can now sign in."}


# ---------------------------------------------------------------------------
# Resend verification
# ---------------------------------------------------------------------------

@router.post("/resend-verification")
@limiter.limit("3/minute")
def resend_verification(request: Request, body: ResendVerificationRequest):
    """
    Issues a new verification token and resends the verification email.
    Always returns 200 to avoid leaking whether the email exists.
    """
    user = get_user_by_email(body.email.lower().strip())
    if user and not user.get("is_verified", 1) and user["provider"] == "email":
        token   = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(hours=24)).isoformat()
        set_verification_token(user["id"], token, expires)
        send_verification_email(user["email"], token)
    return {"message": "If that address is registered and unverified, a new link has been sent."}


# ---------------------------------------------------------------------------
# Forgot password
# ---------------------------------------------------------------------------

@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, body: ForgotPasswordRequest):
    """
    Sends a password-reset email if the address belongs to an email-provider account.
    Always returns 200 to avoid leaking whether the email exists.
    """
    user = get_user_by_email(body.email.lower().strip())
    if user and user["provider"] == "email":
        token   = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        set_reset_token(user["id"], token, expires)
        send_password_reset_email(user["email"], token)
    return {"message": "If that address is registered, a reset link has been sent."}


# ---------------------------------------------------------------------------
# Reset password
# ---------------------------------------------------------------------------

@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, body: ResetPasswordRequest):
    """
    Validates the reset token and sets the new password.
    Clears the token after use so it can't be reused.
    """
    user = get_user_by_reset_token(body.token)
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    expires = user.get("reset_token_expires")
    if expires and datetime.utcnow() > datetime.fromisoformat(expires):
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    _validate_password_strength(body.new_password)

    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    complete_password_reset(user["id"], new_hash)
    return {"message": "Password reset successfully. You can now sign in."}


# ---------------------------------------------------------------------------
# Onboarding complete
# ---------------------------------------------------------------------------

@router.post("/onboarding-complete")
def mark_onboarding_complete(body: OnboardingCompleteRequest):
    """Marks a user's onboarding as finished. Called at the end of /onboarding."""
    success = set_onboarding_complete(body.user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "Onboarding complete."}


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------

@router.get("/me", response_model=AuthResponse)
def me(user_id: int):
    """Returns the current user's info. user_id passed as query param from frontend session."""
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return AuthResponse(
        user_id=user["id"],
        email=user["email"],
        onboarding_complete=bool(user["onboarding_complete"]),
        provider=user["provider"],
    )


# ---------------------------------------------------------------------------
# Change password (email users only)
# ---------------------------------------------------------------------------

@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    user_id: int = Depends(get_authenticated_user),
):
    """Changes password for an email-provider account. user_id derived from bearer token."""
    from database import get_connection

    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user["provider"] != "email":
        raise HTTPException(status_code=400, detail="Password change is only for email accounts.")
    _validate_password_strength(body.new_password)
    if not bcrypt.checkpw(body.current.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()
    return {"message": "Password updated."}
