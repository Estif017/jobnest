"""
api/auth_middleware.py — FastAPI dependency that verifies the HS256 Bearer
token issued by the Next.js /api/auth/token route.

The token is signed with NEXTAUTH_SECRET, so the backend can verify it
independently without calling Next.js. user_id is stored in the JWT "sub"
claim and returned as an int for use by endpoint handlers.
"""

import os
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_bearer = HTTPBearer()


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> int:
    secret = os.getenv("NEXTAUTH_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="Server not configured.")
    try:
        payload = jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
        )
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid credentials.")
