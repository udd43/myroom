"""Backend configuration, `.env` loader, paths, security, and external API settings."""

from __future__ import annotations

import os
import re
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(paths: list[Path]) -> None:
    """Load KEY=VALUE entries from `.env` files without requiring python-dotenv."""
    for env_path in paths:
        if not env_path.is_file():
            continue
        try:
            text = env_path.read_text(encoding="utf-8")
        except OSError:
            continue
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if len(val) >= 2 and ((val[0] == '"' and val[-1] == '"') or (val[0] == "'" and val[-1] == "'")):
                val = val[1:-1]
            if key:
                os.environ.setdefault(key, val)


_load_dotenv([BASE_DIR / ".env", BASE_DIR.parent / ".env"])

STORAGE_DIR = Path(os.getenv("MYROOM_STORAGE_DIR", str(BASE_DIR / "storage")))
DATA_DIR = Path(os.getenv("MYROOM_DATA_DIR", str(BASE_DIR / "data")))
DATA_FILE = DATA_DIR / "rooms.json"
DB_FILE = DATA_DIR / "myroom.db"
AUTH_SECRET_FILE = DATA_DIR / ".auth_secret"

STORAGE_URL_PREFIX = "/storage"
TIMEZONE_SUFFIX = "+09:00"

SUPPORTED_3D_EXTENSIONS = (".splat", ".spz", ".sog", ".ply", ".glb", ".usdz", ".json")
SUPPORTED_MEDIA_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".mp4", ".mov", ".webm", ".m4a")
SUPPORTED_VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".m4v", ".avi")

SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def is_safe_id(value: str) -> bool:
    """Return True if an entity ID is safe for URLs and filesystem subdirectories."""
    return bool(value and SAFE_ID_PATTERN.fullmatch(value))


def _parse_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
]
_env_cors = os.getenv("MYROOM_CORS_ORIGINS", "").strip()
CORS_ORIGINS: list[str] = _parse_csv(_env_cors) if _env_cors else list(DEFAULT_CORS_ORIGINS)
# Allow Vercel preview/prod domains unless explicitly overridden to empty string
CORS_ORIGIN_REGEX: str | None = os.getenv("MYROOM_CORS_ORIGIN_REGEX", r"^https://[a-zA-Z0-9-]+\.vercel\.app$").strip() or None

# Authentication, docs visibility & brute-force rate limit
ADMIN_PASSWORD: str = os.getenv("MYROOM_ADMIN_PASSWORD", "").strip()
AUTH_SECRET: str = os.getenv("MYROOM_AUTH_SECRET", "").strip()
AUTH_TOKEN_TTL_SECONDS: int = int(os.getenv("MYROOM_AUTH_TTL_SECONDS", str(60 * 60 * 24 * 30)))
AUTH_MAX_FAILURES: int = max(3, int(os.getenv("MYROOM_AUTH_MAX_FAILURES", "5")))
AUTH_WINDOW_SECONDS: int = max(60, int(os.getenv("MYROOM_AUTH_WINDOW_SECONDS", "300")))
AUTH_LOCK_SECONDS: int = max(60, int(os.getenv("MYROOM_AUTH_LOCK_SECONDS", "600")))
ENABLE_DOCS: bool = os.getenv("MYROOM_ENABLE_DOCS", "false").strip().lower() in ("1", "true", "yes")

# Upload / conversion safety guards (1 GB RAM Oracle VM friendly)
MAX_UPLOAD_MB: int = max(10, int(os.getenv("MYROOM_MAX_UPLOAD_MB", "150")))
MAX_UPLOAD_BYTES: int = MAX_UPLOAD_MB * 1024 * 1024
MAX_MEDIA_MB: int = max(5, int(os.getenv("MYROOM_MAX_MEDIA_MB", "40")))
MAX_MEDIA_BYTES: int = MAX_MEDIA_MB * 1024 * 1024
MAX_CONCURRENT_CONVERSIONS: int = max(1, int(os.getenv("MYROOM_MAX_CONCURRENT_JOBS", "1")))

# Optional Cloudflare R2 direct storage
R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "").strip()
R2_ENDPOINT_URL: str = os.getenv("R2_ENDPOINT_URL", "").strip() or (
    f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else ""
)
R2_BUCKET: str = os.getenv("R2_BUCKET", "").strip()
R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "").strip()
R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
R2_PUBLIC_BASE_URL: str = os.getenv("R2_PUBLIC_BASE_URL", "").strip().rstrip("/")

# Korean public & developer APIs
DATA_GO_KR_API_KEY: str = os.getenv("DATA_GO_KR_API_KEY", "").strip()
KAKAO_REST_API_KEY: str = os.getenv("KAKAO_REST_API_KEY", "").strip()
KAKAO_MOBILITY_TRANSIT_ENABLED: bool = os.getenv("KAKAO_MOBILITY_TRANSIT_ENABLED", "").strip().lower() in ("1", "true", "yes")
ODSAY_API_KEY: str = os.getenv("ODSAY_API_KEY", "").strip()
VWORLD_API_KEY: str = os.getenv("VWORLD_API_KEY", "").strip()
VWORLD_DOMAIN: str = os.getenv("VWORLD_DOMAIN", "localhost").strip()
JUSO_API_KEY: str = os.getenv("JUSO_API_KEY", "").strip()


def ensure_dirs() -> None:
    """Create persistent storage and database directories if missing."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def storage_url(room_id: str, filename: str, cache_bust: int | None = None) -> str:
    base = f"{STORAGE_URL_PREFIX}/{room_id}/{filename}"
    return f"{base}?v={cache_bust}" if cache_bust is not None else base


def integration_status() -> dict[str, object]:
    """Return non-sensitive readiness flags for security, storage, and external APIs."""
    r2_ready = bool(R2_ENDPOINT_URL and R2_BUCKET and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_PUBLIC_BASE_URL)
    return {
        "authEnabled": bool(ADMIN_PASSWORD),
        "r2Enabled": r2_ready,
        "maxUploadMb": MAX_UPLOAD_MB,
        "maxConcurrentJobs": MAX_CONCURRENT_CONVERSIONS,
        "apis": {
            "juso": bool(JUSO_API_KEY),
            "dataGoKrBuilding": bool(DATA_GO_KR_API_KEY),
            "dataGoKrRent": bool(DATA_GO_KR_API_KEY),
            "kakaoLocal": bool(KAKAO_REST_API_KEY),
            "transit": bool(ODSAY_API_KEY or (KAKAO_REST_API_KEY and KAKAO_MOBILITY_TRANSIT_ENABLED)),
            "odsay": bool(ODSAY_API_KEY),
            "kakaoMobilityTransit": bool(KAKAO_REST_API_KEY and KAKAO_MOBILITY_TRANSIT_ENABLED),
            "vworld3d": bool(VWORLD_API_KEY),
        },
    }
