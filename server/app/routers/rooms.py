import shutil
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from ..config import STORAGE_DIR, TIMEZONE_SUFFIX
from ..schemas import PinCreateRequest, RoomCreateRequest, RoomUpdateRequest
from ..store import Room, room_store

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

ROOM_NOT_FOUND = "매물을 찾을 수 없습니다."

DEFAULT_CHECKLIST = {
    "sunlight": "good",
    "waterPressure": "good",
    "soundproof": "normal",
    "mold": "good",
    "security": "good",
    "parking": "normal",
}


def get_room_or_404(room_id: str) -> Room:
    room = room_store.get(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=ROOM_NOT_FOUND)
    return room


@router.get("")
def list_rooms() -> list[dict[str, Any]]:
    return room_store.list_rooms()


@router.get("/{room_id}")
def get_room(room_id: str) -> dict[str, Any]:
    return get_room_or_404(room_id)


@router.post("")
def create_room(payload: RoomCreateRequest) -> dict[str, Any]:
    room_id = f"room-{uuid.uuid4().hex[:8]}"
    (STORAGE_DIR / room_id).mkdir(parents=True, exist_ok=True)

    new_room = {
        "id": room_id,
        "title": payload.title,
        "address": payload.address,
        "dealType": payload.dealType,
        "deposit": payload.deposit,
        "monthlyRent": payload.monthlyRent,
        "maintenanceFee": payload.maintenanceFee,
        "areaPyeong": payload.areaPyeong,
        "roomStructure": payload.roomStructure,
        "floor": payload.floor,
        "direction": payload.direction,
        "MoveInDate": "협의",
        "rating": 4.0,
        "pros": payload.pros,
        "cons": payload.cons,
        "memo": payload.memo,
        "checklist": payload.checklist or dict(DEFAULT_CHECKLIST),
        "pins": [],
        "status": "empty",
        "progress": 0,
        "stageText": "집 내부 영상 또는 3D 스캔 파일을 업로드해 주세요.",
        "splatUrl": None,
        "plyUrl": None,
        "videoUrl": None,
        "thumbUrl": None,
        "splatCount": 0,
        "engine": None,
        "createdAt": time.strftime(f"%Y-%m-%dT%H:%M:%S{TIMEZONE_SUFFIX}"),
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "locationLabel": payload.locationLabel,
        "sunHeadingOffsetDeg": payload.sunHeadingOffsetDeg,
    }
    return room_store.insert(new_room)


@router.patch("/{room_id}")
def update_room(room_id: str, payload: RoomUpdateRequest) -> dict[str, Any]:
    room = room_store.update(room_id, payload.model_dump(exclude_unset=True))
    if room is None:
        raise HTTPException(status_code=404, detail=ROOM_NOT_FOUND)
    return room


@router.delete("/{room_id}")
def delete_room(room_id: str) -> dict[str, str]:
    room_store.delete(room_id)
    shutil.rmtree(STORAGE_DIR / room_id, ignore_errors=True)
    return {"status": "deleted"}


@router.post("/{room_id}/pins")
def add_pin(room_id: str, payload: PinCreateRequest) -> dict[str, Any]:
    pin = {
        "id": f"pin-{uuid.uuid4().hex[:6]}",
        "label": payload.label,
        "category": payload.category,
        "position": payload.position,
    }
    room = room_store.add_pin(room_id, pin)
    if room is None:
        raise HTTPException(status_code=404, detail=ROOM_NOT_FOUND)
    return room
