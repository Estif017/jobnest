import os
from slowapi import Limiter
from jose import jwt, JWTError


def _key_by_user(request) -> str:
    """Rate limit per authenticated user (JWT sub). Falls back to IP."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        try:
            secret = os.getenv("NEXTAUTH_SECRET", "dev-secret")
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            return f"user:{payload.get('sub', 'anon')}"
        except JWTError:
            pass
    return f"ip:{request.client.host}" if request.client else "ip:unknown"


limiter = Limiter(key_func=_key_by_user)
