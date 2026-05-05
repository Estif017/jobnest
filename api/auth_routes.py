"""
api/auth_routes.py — Authentication endpoints for JobNest.

Handles registration, login, Google OAuth upsert, onboarding completion,
and password change. All password hashing uses bcrypt — plain text is never
stored. Mounted into the main FastAPI app under the /auth prefix.
"""

import re
import sqlite3

import bcrypt
from fastapi import APIRouter, HTTPException

from api.schemas import (
    RegisterRequest, LoginRequest, GoogleAuthRequest,
    AuthResponse, OnboardingCompleteRequest, ChangePasswordRequest,
)
from db_operations import (
    create_user, get_user_by_email, get_user_by_id, set_onboarding_complete,
)

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    """
    Creates a new email/password account.
    Returns a success message — does NOT auto-login (frontend redirects to /login).
    """
    if not EMAIL_RE.match(body.email):
        raise HTTPException(status_code=400, detail="Invalid email address.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    try:
        create_user(email=body.email.lower().strip(), password_hash=pw_hash, provider="email")
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    return {"message": "Account created. Please sign in."}


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    """
    Verifies email + password and returns user info.
    Called by the NextAuth Credentials provider's authorize() function.
    """
    user = get_user_by_email(body.email.lower().strip())

    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if user["provider"] == "google":
        raise HTTPException(
            status_code=400,
            detail="This account uses Google sign-in. Use 'Continue with Google'.",
        )

    if not bcrypt.checkpw(body.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

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
    Creates the user in our DB if they don't exist yet (upsert).
    """
    email = body.email.lower().strip()
    user = get_user_by_email(email)

    if user is None:
        user_id = create_user(email=email, password_hash=None, provider="google")
        user = get_user_by_id(user_id)

    return AuthResponse(
        user_id=user["id"],
        email=user["email"],
        onboarding_complete=bool(user["onboarding_complete"]),
        provider=user["provider"],
    )


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
def change_password(body: ChangePasswordRequest):
    """Changes password for an email-provider account. Verifies current password first."""
    from database import get_connection

    user = get_user_by_id(body.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user["provider"] != "email":
        raise HTTPException(status_code=400, detail="Password change is only for email accounts.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    if not bcrypt.checkpw(body.current.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")

    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, body.user_id))
    conn.commit()
    conn.close()
    return {"message": "Password updated."}
