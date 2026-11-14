"""Minimal Cloudflare R2 (S3-compatible) SigV4 presigned URL & upload helper using stdlib."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import mimetypes
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .. import config


def is_r2_enabled() -> bool:
    return bool(
        config.R2_ENDPOINT_URL
        and config.R2_BUCKET
        and config.R2_ACCESS_KEY_ID
        and config.R2_SECRET_ACCESS_KEY
        and config.R2_PUBLIC_BASE_URL
    )


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _signing_key(secret_key: str, date_stamp: str, region: str = "auto", service: str = "s3") -> bytes:
    k_date = _sign(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    return _sign(k_service, "aws4_request")


def create_presigned_put_url(
    object_key: str,
    content_type: str = "application/octet-stream",
    expires_seconds: int = 900,
) -> dict[str, Any]:
    """Generate an S3 SigV4 query-authenticated PUT URL for Cloudflare R2."""
    if not is_r2_enabled():
        return {"enabled": False}

    clean_key = object_key.lstrip("/")
    parsed = urllib.parse.urlparse(config.R2_ENDPOINT_URL)
    host = parsed.netloc
    base_path = parsed.path.rstrip("/")
    canonical_uri = urllib.parse.quote(f"{base_path}/{config.R2_BUCKET}/{clean_key}", safe="/~")

    now = dt.datetime.now(dt.timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    region = "auto"
    service = "s3"
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"

    query_params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": f"{config.R2_ACCESS_KEY_ID}/{credential_scope}",
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(max(60, min(expires_seconds, 3600))),
        "X-Amz-SignedHeaders": "host",
    }
    canonical_querystring = "&".join(
        f"{urllib.parse.quote(k, safe='~')}={urllib.parse.quote(v, safe='~')}"
        for k, v in sorted(query_params.items())
    )
    canonical_headers = f"host:{host}\n"
    canonical_request = "\n".join([
        "PUT",
        canonical_uri,
        canonical_querystring,
        canonical_headers,
        "host",
        "UNSIGNED-PAYLOAD",
    ])
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amz_date,
        credential_scope,
        hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
    ])
    signature = hmac.new(
        _signing_key(config.R2_SECRET_ACCESS_KEY, date_stamp, region, service),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    upload_url = f"{parsed.scheme}://{host}{canonical_uri}?{canonical_querystring}&X-Amz-Signature={signature}"
    public_url = f"{config.R2_PUBLIC_BASE_URL}/{clean_key}"
    return {
        "enabled": True,
        "uploadUrl": upload_url,
        "publicUrl": public_url,
        "objectKey": clean_key,
        "contentType": content_type,
        "expiresIn": expires_seconds,
    }


def upload_file_to_r2(local_path: Path, object_key: str, content_type: str | None = None) -> str | None:
    """Upload a local artifact directly to R2 via presigned PUT; return public URL or None."""
    if not is_r2_enabled() or not local_path.is_file():
        return None
    ctype = content_type or mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    info = create_presigned_put_url(object_key, content_type=ctype, expires_seconds=300)
    if not info.get("enabled"):
        return None
    try:
        data = local_path.read_bytes()
        req = urllib.request.Request(
            info["uploadUrl"],
            data=data,
            method="PUT",
            headers={"Content-Type": ctype},
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            if 200 <= resp.status < 300:
                return str(info["publicUrl"])
    except Exception:
        return None
    return None
