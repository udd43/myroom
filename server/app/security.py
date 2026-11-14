"""Stateless HMAC-SHA256 authentication for protecting mutating/private MyRoom endpoints."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import Header, HTTPException

from . import config


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def get_signing_secret() -> bytes:
    """Return configured signing secret or persist a random local secret on first run."""
    if config.AUTH_SECRET:
        return config.AUTH_SECRET.encode("utf-8")
    config.ensure_dirs()
    if config.AUTH_SECRET_FILE.exists():
        saved = config.AUTH_SECRET_FILE.read_text(encoding="utf-8").strip()
        if saved:
            return saved.encode("utf-8")
    generated = secrets.token_urlsafe(48)
    config.AUTH_SECRET_FILE.write_text(generated, encoding="utf-8")
    try:
        config.AUTH_SECRET_FILE.chmod(0o600)
    except OSError:
        pass
    return generated.encode("utf-8")


def is_auth_enabled() -> bool:
    return bool(config.ADMIN_PASSWORD)


def verify_password(candidate: str) -> bool:
    if not config.ADMIN_PASSWORD:
        return True
    return hmac.compare_digest(candidate.encode("utf-8"), config.ADMIN_PASSWORD.encode("utf-8"))


def create_access_token(subject: str = "owner", ttl_seconds: int | None = None) -> dict[str, Any]:
    now = int(time.time())
    ttl = ttl_seconds if ttl_seconds is not None else config.AUTH_TOKEN_TTL_SECONDS
    payload = {"sub": subject, "iat": now, "exp": now + ttl}
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64url_encode(hmac.new(get_signing_secret(), body.encode("ascii"), hashlib.sha256).digest())
    return {
        "token": f"{body}.{sig}",
        "tokenType": "Bearer",
        "expiresAt": now + ttl,
    }


def verify_access_token(token: str) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    try:
        body, sig = token.split(".", 1)
        expected_sig = _b64url_encode(hmac.new(get_signing_secret(), body.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected_sig):
            return None
        payload = json.loads(_b64url_decode(body).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def extract_token_from_headers(authorization: str | None, x_myroom_token: str | None) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    if x_myroom_token:
        return x_myroom_token.strip()
    return ""


def check_request_auth(
    authorization: str | None = None,
    x_myroom_token: str | None = None,
    x_myroom_password: str | None = None,
) -> bool:
    if not is_auth_enabled():
        return True
    if x_myroom_password and verify_password(x_myroom_password):
        return True
    token = extract_token_from_headers(authorization, x_myroom_token)
    return verify_access_token(token) is not None


async def require_auth(
    authorization: str | None = Header(default=None),
    x_myroom_token: str | None = Header(default=None),
    x_myroom_password: str | None = Header(default=None),
) -> None:
    """FastAPI dependency enforcing auth when MYROOM_ADMIN_PASSWORD is configured."""
    if not check_request_auth(authorization, x_myroom_token, x_myroom_password):
        raise HTTPException(status_code=401, detail="인증이 필요합니다. 관리자 비밀번호로 로그인해 주세요.")
