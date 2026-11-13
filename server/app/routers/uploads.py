import shutil
import time
from pathlib import Path
from typing import Any, BinaryIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from pipeline import convert_ply_to_splat, parse_roomplan_json

from ..config import STORAGE_DIR, SUPPORTED_3D_EXTENSIONS, storage_url
from ..services.jobs import start_video_job
from ..store import room_store
from .rooms import get_room_or_404

router = APIRouter(prefix="/api/rooms", tags=["uploads"])


def _save_upload(src: BinaryIO, dest: Path) -> None:
    with open(dest, "wb") as out:
        shutil.copyfileobj(src, out)


@router.post("/{room_id}/upload-video")
async def upload_video(
    room_id: str,
    file: UploadFile = File(...),
    quality: str = Form("high"),
) -> dict[str, Any]:
    get_room_or_404(room_id)

    room_dir = STORAGE_DIR / room_id
    room_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    video_path = room_dir / f"source{ext}"
    _save_upload(file.file, video_path)

    room_store.update_progress(
        room_id,
        5,
        "영상 업로드 완료 — 3D 볼류메트릭 변환 파이프라인 시작 중...",
        {
            "status": "processing",
            "videoUrl": storage_url(room_id, f"source{ext}"),
        },
    )
    start_video_job(room_store, room_id, room_dir, video_path, quality)
    return get_room_or_404(room_id)


@router.post("/{room_id}/upload-3d")
async def upload_3d_file(
    room_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    get_room_or_404(room_id)

    ext = Path(file.filename or "scene.splat").suffix.lower()
    if ext not in SUPPORTED_3D_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=".glb, .usdz, .json(RoomPlan), .splat, .ply 파일만 지원합니다.",
        )

    room_dir = STORAGE_DIR / room_id
    room_dir.mkdir(parents=True, exist_ok=True)
    ts = int(time.time())

    if ext == ".glb":
        model_path = room_dir / "model.glb"
        _save_upload(file.file, model_path)
        size_mb = model_path.stat().st_size / (1024 * 1024)
        room_store.update_progress(
            room_id,
            100,
            f"LiDAR 메시 로드 완료 ({size_mb:.1f} MB)",
            {
                "status": "ready",
                "modelUrl": storage_url(room_id, "model.glb", ts),
                "engine": "lidar_mesh",
            },
        )
        return get_room_or_404(room_id)

    if ext == ".usdz":
        usdz_path = room_dir / "room.usdz"
        _save_upload(file.file, usdz_path)
        size_mb = usdz_path.stat().st_size / (1024 * 1024)
        room_store.update_progress(
            room_id,
            100,
            f"iOS RoomPlan USDZ 로드 완료 ({size_mb:.1f} MB)",
            {
                "status": "ready",
                "usdzUrl": storage_url(room_id, "room.usdz", ts),
                "engine": "apple_roomplan",
            },
        )
        return get_room_or_404(room_id)

    if ext == ".json":
        json_path = room_dir / "roomplan.json"
        _save_upload(file.file, json_path)
        plan_data = parse_roomplan_json(json_path)
        room_store.update_progress(
            room_id,
            100,
            f"Apple RoomPlan 2D/3D 도면 추출 완료 ({plan_data['widthM']}×{plan_data['depthM']}m)",
            {
                "status": "ready",
                "roomPlan": plan_data,
                "engine": "apple_roomplan",
            },
        )
        return get_room_or_404(room_id)

    splat_path = room_dir / "scene.splat"
    ply_path = room_dir / "scene.ply"

    if ext == ".splat":
        _save_upload(file.file, splat_path)
        splat_count = splat_path.stat().st_size // 32
    else:
        _save_upload(file.file, ply_path)
        splat_count = convert_ply_to_splat(ply_path, splat_path)

    ts = int(time.time())
    room_store.update_progress(
        room_id,
        100,
        f"3D 스캔 파일 로드 완료 ({splat_count:,} splats)",
        {
            "status": "ready",
            "splatUrl": storage_url(room_id, "scene.splat", ts),
            "plyUrl": storage_url(room_id, "scene.ply", ts) if ply_path.exists() else None,
            "splatCount": splat_count,
            "engine": "direct_3d_upload",
        },
    )
    return get_room_or_404(room_id)
