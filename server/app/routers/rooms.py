"""Room CRUD, pins, move-in/out evidence timeline, sync, and read-only share routes."""

from __future__ import annotations

import shutil
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from .. import config
from ..schemas import RoomCreate, RoomPinCreate, RoomSyncRequest, RoomUpdate, TimelineEventCreate
from ..security import require_auth
from ..store import room_store

router = APIRouter(prefix="/api", tags=["rooms"])


def _now_iso() -> str:
    return datetime.now().strftime(f"%Y-%m-%dT%H:%M:%S{config.TIMEZONE_SUFFIX}")


@router.get("/rooms")
async def list_rooms(_auth: None = Depends(require_auth)) -> list[dict[str, Any]]:
    return room_store.list_rooms()


@router.get("/rooms/{room_id}")
async def get_room(room_id: str, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    room = room_store.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.post("/rooms", status_code=201)
async def create_room(payload: RoomCreate, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    room_id = f"room-{uuid.uuid4().hex[:10]}"
    now = _now_iso()
    data = payload.model_dump()
    room: dict[str, Any] = {
        **data,
        "id": room_id,
        "status": "idle",
        "progress": 0,
        "stageText": "매물 등록됨 (영상 또는 3D 파일 업로드 대기)",
        "splatUrl": None,
        "spzUrl": None,
        "plyUrl": None,
        "modelUrl": None,
        "usdzUrl": None,
        "videoUrl": None,
        "thumbUrl": None,
        "splatCount": 0,
        "engine": None,
        "createdAt": now,
        "updatedAt": now,
    }
    return room_store.insert(room)


@router.post("/rooms/sync")
async def sync_local_rooms(payload: RoomSyncRequest, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    """One-click sync of locally cached browser rooms onto the server database."""
    inserted = room_store.upsert_many(payload.rooms)
    return {"syncedCount": len(inserted), "rooms": room_store.list_rooms()}


@router.patch("/rooms/{room_id}")
async def update_room(room_id: str, payload: RoomUpdate, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    updates = payload.model_dump(exclude_unset=True)
    updated = room_store.update(room_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return updated


@router.delete("/rooms/{room_id}")
async def delete_room(room_id: str, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    if not room_store.get(room_id):
        raise HTTPException(status_code=404, detail="Room not found")
    room_store.delete(room_id)
    room_dir = config.STORAGE_DIR / room_id
    if room_dir.exists():
        shutil.rmtree(room_dir, ignore_errors=True)
    return {"ok": True, "id": room_id}


@router.post("/rooms/{room_id}/pins")
async def add_pin(room_id: str, payload: RoomPinCreate, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    pin = {
        "id": f"pin-{uuid.uuid4().hex[:8]}",
        "createdAt": payload.createdAt or _now_iso(),
        **payload.model_dump(exclude_none=True, exclude={"createdAt"}),
    }
    updated = room_store.add_pin(room_id, pin)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return updated


@router.delete("/rooms/{room_id}/pins/{pin_id}")
async def delete_pin(room_id: str, pin_id: str, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    updated = room_store.remove_pin(room_id, pin_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return updated


@router.post("/rooms/{room_id}/timeline")
async def add_timeline_event(
    room_id: str,
    payload: TimelineEventCreate,
    _auth: None = Depends(require_auth),
) -> dict[str, Any]:
    event = {
        "id": f"tl-{uuid.uuid4().hex[:8]}",
        "createdAt": payload.createdAt or _now_iso(),
        **payload.model_dump(exclude_none=True, exclude={"createdAt"}),
    }
    updated = room_store.add_timeline_event(room_id, event)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return updated


@router.delete("/rooms/{room_id}/timeline/{event_id}")
async def delete_timeline_event(
    room_id: str,
    event_id: str,
    _auth: None = Depends(require_auth),
) -> dict[str, Any]:
    updated = room_store.remove_timeline_event(room_id, event_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return updated


@router.post("/rooms/{room_id}/share")
async def create_or_rotate_share_link(
    room_id: str,
    regenerate: bool = False,
    _auth: None = Depends(require_auth),
) -> dict[str, Any]:
    updated = room_store.ensure_share_token(room_id, regenerate=regenerate)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"id": room_id, "shareToken": updated["shareToken"], "room": updated}


@router.delete("/rooms/{room_id}/share")
async def revoke_share_link(room_id: str, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    updated = room_store.revoke_share_token(room_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"ok": True, "id": room_id, "room": updated}


@router.get("/share/{token}")
async def get_shared_room(token: str) -> dict[str, Any]:
    """Read-only public room snapshot accessible via unguessable share token."""
    room = room_store.get_by_share_token(token)
    if not room:
        raise HTTPException(status_code=404, detail="유효하지 않거나 만료된 공유 링크입니다.")
    return {"readOnly": True, "room": room}
