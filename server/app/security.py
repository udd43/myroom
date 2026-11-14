"""Stateless HMAC-SHA256 authentication, brute-force rate limiting, and safe storage path helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import Header, HTTPException, Request

from . import config

_log = logging.getLogger("myroom.security")
_warned_weak_secret = False

_rate_lock = threading.Lock()
_failed_attempts: dict[str, list[float]] = {}
_locked_until: dict[str, float] = {}


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def get_signing_secret() -> bytes:
    """Return configured strong signing secret (>=16 chars) or persist a random local secret."""
    global _warned_weak_secret
    if len(config.AUTH_SECRET) >= 16:
        return config.AUTH_SECRET.encode("utf-8")
    if config.AUTH_SECRET and not _warned_weak_secret:
        _log.warning("MYROOM_AUTH_SECRET is shorter than 16 chars; ignoring weak secret and using random .auth_secret.")
        _warned_weak_secret = True
    config.ensure_dirs()
    if config.AUTH_SECRET_FILE.exists():
        saved = config.AUTH_SECRET_FILE.read_text(encoding="utf-8").strip()
        if len(saved) >= 16:
            return saved.encode("utf-8")
    generated = secrets.token_urlsafe(48)
    config.AUTH_SECRET_FILE.write_text(generated, encoding="utf-8")
    try:
        config.AUTH_SECRET_FILE.chmod(0o600)
    except OSError:
        pass
    return generated.encode("utf-8")


def get_client_ip(request: Request | None) -> str:
    """Resolve client IP safely, honoring proxy headers only when behind local reverse proxy."""
    if request is None:
        return "unknown"
    direct = request.client.host if request.client and request.client.host else "unknown"
    if direct in ("127.0.0.1", "::1", "localhost", "testclient"):
        real_ip = (request.headers.get("x-real-ip") or "").strip()
        if real_ip:
            return real_ip
        forwarded = (request.headers.get("x-forwarded-for") or "").strip()
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                return parts[-1]
    return direct


def reset_rate_limiter() -> None:
    """Clear tracked login failures (for unit tests)."""
    with _rate_lock:
        _failed_attempts.clear()
        _locked_until.clear()


def assert_not_rate_limited(client_ip: str) -> None:
    """Raise HTTP 429 if the client IP is currently locked out from auth failures."""
    now = time.monotonic()
    with _rate_lock:
        until = _locked_until.get(client_ip, 0.0)
        if until > now:
            retry_after = max(1, int(until - now))
            raise HTTPException(
                status_code=429,
                detail=f"로그인 시도가 너무 많습니다. {retry_after}초 후 다시 시도해 주세요.",
                headers={"Retry-After": str(retry_after)},
            )


def _record_auth_failure(client_ip: str) -> int | None:
    now = time.monotonic()
    cutoff = now - config.AUTH_WINDOW_SECONDS
    with _rate_lock:
        recent = [ts for ts in _failed_attempts.get(client_ip, []) if ts > cutoff]
        recent.append(now)
        if len(recent) >= config.AUTH_MAX_FAILURES:
            _failed_attempts.pop(client_ip, None)
            _locked_until[client_ip] = now + config.AUTH_LOCK_SECONDS
            return config.AUTH_LOCK_SECONDS
        _failed_attempts[client_ip] = recent
        return None


def _clear_auth_failures(client_ip: str) -> None:
    with _rate_lock:
        _failed_attempts.pop(client_ip, None)
        _locked_until.pop(client_ip, None)


def is_auth_enabled() -> bool:
    return bool(config.ADMIN_PASSWORD)


def verify_password(candidate: str) -> bool:
    if not config.ADMIN_PASSWORD:
        return True
    return hmac.compare_digest(candidate.encode("utf-8"), config.ADMIN_PASSWORD.encode("utf-8"))


def verify_password_rate_limited(client_ip: str, candidate: str) -> bool:
    """Verify admin password with per-IP brute-force lockout protection."""
    assert_not_rate_limited(client_ip)
    if verify_password(candidate):
        _clear_auth_failures(client_ip)
        return True
    locked_for = _record_auth_failure(client_ip)
    if locked_for:
        raise HTTPException(
            status_code=429,
            detail=f"비밀번호 오류 횟수 초과로 {locked_for}초간 잠겼습니다.",
            headers={"Retry-After": str(locked_for)},
        )
    return False


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
    request: Request | None = None,
) -> bool:
    if not is_auth_enabled():
        return True
    token = extract_token_from_headers(authorization, x_myroom_token)
    if verify_access_token(token) is not None:
        return True
    if x_myroom_password:
        return verify_password_rate_limited(get_client_ip(request), x_myroom_password)
    return False


async def require_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    x_myroom_token: str | None = Header(default=None),
    x_myroom_password: str | None = Header(default=None),
) -> None:
    """FastAPI dependency enforcing auth when MYROOM_ADMIN_PASSWORD is configured."""
    if not check_request_auth(authorization, x_myroom_token, x_myroom_password, request=request):
        raise HTTPException(status_code=401, detail="인증이 필요합니다. 관리자 비밀번호로 로그인해 주세요.")


def validate_room_id(room_id: str) -> str:
    """Reject path-traversal or malformed room IDs before filesystem/DB operations."""
    if not config.is_safe_id(room_id):
        raise HTTPException(status_code=400, detail="유효하지 않은 매물 ID 형식입니다.")
    return room_id


def safe_room_storage_dir(room_id: str) -> Path:
    """Resolve room storage path guaranteed to stay inside STORAGE_DIR."""
    validate_room_id(room_id)
    base = config.STORAGE_DIR.resolve()
    target = (base / room_id).resolve()
    if not target.is_relative_to(base) or target == base:
        raise HTTPException(status_code=400, detail="허용되지 않는 저장소 경로입니다.")
    return target

