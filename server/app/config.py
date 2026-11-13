"""Static configuration and filesystem locations.

Defaults keep the original layout (``server/storage`` and
``server/data/rooms.json``). Both can be overridden with the
``MYROOM_STORAGE_DIR`` / ``MYROOM_DATA_FILE`` environment variables, which is
handy for tests.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = Path(os.environ.get("MYROOM_STORAGE_DIR", BASE_DIR / "storage"))
DATA_FILE = Path(os.environ.get("MYROOM_DATA_FILE", BASE_DIR / "data" / "rooms.json"))

STORAGE_URL_PREFIX = "/storage"

APP_TITLE = "MyRoom 3D Volumetric & Gaussian Splatting Server"
APP_VERSION = "1.0.0"

CORS_ORIGINS = ["*"]

TIMEZONE_SUFFIX = "+09:00"

SUPPORTED_3D_EXTENSIONS = (".splat", ".ply", ".glb", ".usdz", ".json")


def ensure_dirs() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)


def storage_url(room_id: str, filename: str, cache_bust: int | None = None) -> str:
    url = f"{STORAGE_URL_PREFIX}/{room_id}/{filename}"
    return f"{url}?t={cache_bust}" if cache_bust is not None else url
