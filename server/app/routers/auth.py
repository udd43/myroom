"""Authentication status and login endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from .. import config
from ..security import (
    check_request_auth,
    create_access_token,
    get_client_ip,
    is_auth_enabled,
    verify_password_rate_limited,
)
from ..services.r2_storage import is_r2_enabled

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.get("/status")
async def auth_status(
    request: Request,
    authorization: str | None = Header(default=None),
    x_myroom_token: str | None = Header(default=None),
    x_myroom_password: str | None = Header(default=None),
):
    enabled = is_auth_enabled()
    authenticated = True if not enabled else check_request_auth(authorization, x_myroom_token, x_myroom_password, request=request)
    return {
        "authEnabled": enabled,
        "authenticated": authenticated,
        "maxUploadMb": config.MAX_UPLOAD_MB,
        "r2Enabled": is_r2_enabled(),
    }


@router.post("/login")
async def login(request: Request, payload: LoginRequest):
    if not is_auth_enabled():
        return {"authEnabled": False, "authenticated": True, "token": "", "tokenType": "Bearer", "expiresAt": 0}
    client_ip = get_client_ip(request)
    if not verify_password_rate_limited(client_ip, payload.password):
        raise HTTPException(status_code=401, detail="비밀번호가 일치하지 않습니다.")
    issued = create_access_token("owner")
    return {"authEnabled": True, "authenticated": True, **issued}

