"""Health & engine capability check endpoints."""

from fastapi import APIRouter

from pipeline import check_engine_capabilities

from .. import config
from ..services.jobs import get_queue_status
from ..store import room_store

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "engine": check_engine_capabilities(),
        "storage": room_store.db_stats(),
        "queue": get_queue_status(),
        "capabilities": config.integration_status(),
    }
