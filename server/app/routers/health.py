from typing import Any

from fastapi import APIRouter

from pipeline import check_engine_capabilities

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def get_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": check_engine_capabilities(),
    }
