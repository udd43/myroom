"""Streaming size-bounded upload handlers for videos, 3D scans (.splat/.spz/.glb/.usdz/.json), pin/timeline media, and R2 presign."""

from __future__ import annotations

import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

from pipeline import convert_ply_to_splat, convert_splat_to_spz, parse_roomplan_json

from .. import config
from ..schemas import PresignUploadRequest
from ..security import require_auth, safe_room_storage_dir, validate_room_id
from ..services.jobs import run_video_to_3d_job
from ..services.r2_storage import create_presigned_put_url, is_r2_enabled, upload_file_to_r2
from ..store import room_store

router = APIRouter(prefix="/api", tags=["uploads"])


async def _save_upload_with_limit(upload: UploadFile, dest: Path, max_bytes: int) -> int:
    """Stream uploaded file to disk in 1 MB chunks, enforcing size ceiling before OOM."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"업로드 용량이 제한({max_bytes // (1024 * 1024)}MB)을 초과했습니다.",
                    )
                out.write(chunk)
    except HTTPException:
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise
    return written


@router.post("/uploads/presign")
async def presign_upload(payload: PresignUploadRequest, _auth: None = Depends(require_auth)) -> dict[str, Any]:
    validate_room_id(payload.roomId)
    if not is_r2_enabled():
        return {"enabled": False}
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(payload.filename).name).lstrip(".")
    if not safe_name:
        raise HTTPException(status_code=400, detail="유효하지 않은 파일 이름입니다.")
    key = f"rooms/{payload.roomId}/{uuid.uuid4().hex[:6]}_{safe_name}"
    return create_presigned_put_url(key, content_type=payload.contentType)


@router.post("/rooms/{room_id}/upload-video")
async def upload_video(
    room_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    quality: str = Form("high"),
    _auth: None = Depends(require_auth),
) -> dict[str, Any]:
    room_dir = safe_room_storage_dir(room_id)
    room = room_store.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    suffix = Path(file.filename or "scan.mp4").suffix.lower() or ".mp4"
    if suffix not in config.SUPPORTED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 영상 형식입니다: {suffix}")
    room_dir.mkdir(parents=True, exist_ok=True)
    video_name = f"source{suffix}"
    video_path = room_dir / video_name
    await _save_upload_with_limit(file, video_path, config.MAX_UPLOAD_BYTES)

    cb = int(time.time())
    video_url = config.storage_url(room_id, video_name, cache_bust=cb)
    room_store.update(
        room_id,
        {
            "status": "queued",
            "progress": 5,
            "stageText": "영상 업로드 완료 · 3D 변환 대기열 등록",
            "videoUrl": video_url,
        },
    )

    workspace_dir = room_dir / "work"
    if workspace_dir.exists():
        shutil.rmtree(workspace_dir, ignore_errors=True)

    background_tasks.add_task(run_video_to_3d_job, room_id, video_path, workspace_dir, room_dir, quality)
    return room_store.get(room_id) or {}


@router.post("/rooms/{room_id}/upload-3d")
async def upload_3d_scan(
    room_id: str,
    file: UploadFile | None = File(default=None),
    files: list[UploadFile] | None = File(default=None),
    _auth: None = Depends(require_auth),
) -> dict[str, Any]:
    room_dir = safe_room_storage_dir(room_id)
    room = room_store.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    uploads: list[UploadFile] = []
    if files:
        uploads.extend(files)
    if file:
        uploads.append(file)
    if not uploads:
        raise HTTPException(status_code=400, detail="업로드할 3D 스캔 파일이 없습니다.")

    room_dir.mkdir(parents=True, exist_ok=True)
    cb = int(time.time())
    patch: dict[str, Any] = {}
    recognized = False

    for item in uploads:
        name = Path(item.filename or "").name
        ext = Path(name).suffix.lower()
        if ext not in config.SUPPORTED_3D_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"지원하지 않는 3D 확장자입니다: {ext}")

        if ext == ".json":
            json_path = room_dir / "roomplan.json"
            await _save_upload_with_limit(item, json_path, config.MAX_UPLOAD_BYTES)
            parsed = parse_roomplan_json(json_path)
            patch["roomPlan"] = parsed
            patch.setdefault("engine", "apple_roomplan")
            recognized = True
        elif ext == ".usdz":
            dest = room_dir / "scene.usdz"
            await _save_upload_with_limit(item, dest, config.MAX_UPLOAD_BYTES)
            usdz_url = config.storage_url(room_id, "scene.usdz", cache_bust=cb)
            if is_r2_enabled():
                usdz_url = upload_file_to_r2(dest, f"rooms/{room_id}/scene.usdz", "model/vnd.usdz+zip") or usdz_url
            patch["usdzUrl"] = usdz_url
            patch.setdefault("engine", "apple_roomplan")
            recognized = True
        elif ext == ".glb":
            dest = room_dir / "scene.glb"
            await _save_upload_with_limit(item, dest, config.MAX_UPLOAD_BYTES)
            model_url = config.storage_url(room_id, "scene.glb", cache_bust=cb)
            if is_r2_enabled():
                model_url = upload_file_to_r2(dest, f"rooms/{room_id}/scene.glb", "model/gltf-binary") or model_url
            patch["modelUrl"] = model_url
            patch["engine"] = "lidar_mesh"
            recognized = True
        elif ext == ".splat":
            dest = room_dir / "scene.splat"
            await _save_upload_with_limit(item, dest, config.MAX_UPLOAD_BYTES)
            splat_url = config.storage_url(room_id, "scene.splat", cache_bust=cb)
            patch["splatUrl"] = splat_url
            patch["splatCount"] = max(1, dest.stat().st_size // 32)
            patch.setdefault("engine", "direct_3d_upload")
            spz_dest = room_dir / "scene.spz"
            try:
                convert_splat_to_spz(dest, spz_dest)
                spz_url = config.storage_url(room_id, "scene.spz", cache_bust=cb)
                if is_r2_enabled():
                    spz_url = upload_file_to_r2(spz_dest, f"rooms/{room_id}/scene.spz") or spz_url
                patch["spzUrl"] = spz_url
            except Exception:
                pass
            recognized = True
        elif ext in (".spz", ".sog"):
            target_name = f"scene{ext}"
            dest = room_dir / target_name
            await _save_upload_with_limit(item, dest, config.MAX_UPLOAD_BYTES)
            spz_url = config.storage_url(room_id, target_name, cache_bust=cb)
            if is_r2_enabled():
                spz_url = upload_file_to_r2(dest, f"rooms/{room_id}/{target_name}") or spz_url
            patch["spzUrl"] = spz_url
            patch.setdefault("engine", "direct_3d_upload")
            recognized = True
        elif ext == ".ply":
            ply_dest = room_dir / "scene.ply"
            await _save_upload_with_limit(item, ply_dest, config.MAX_UPLOAD_BYTES)
            splat_dest = room_dir / "scene.splat"
            spz_dest = room_dir / "scene.spz"
            count = convert_ply_to_splat(ply_dest, splat_dest)
            patch["plyUrl"] = config.storage_url(room_id, "scene.ply", cache_bust=cb)
            patch["splatUrl"] = config.storage_url(room_id, "scene.splat", cache_bust=cb)
            patch["splatCount"] = count
            patch.setdefault("engine", "direct_3d_upload")
            try:
                convert_splat_to_spz(splat_dest, spz_dest)
                patch["spzUrl"] = config.storage_url(room_id, "scene.spz", cache_bust=cb)
            except Exception:
                pass
            recognized = True

    if not recognized:
        raise HTTPException(status_code=400, detail="처리할 수 있는 스캔 파일이 없습니다.")

    patch["status"] = "ready"
    patch["progress"] = 100
    patch["stageText"] = "3D 스캔 파일 업로드 완료"
    updated = room_store.update(room_id, patch)
    return updated or {}


@router.post("/rooms/{room_id}/upload-media")
async def upload_pin_or_timeline_media(
    room_id: str,
    file: UploadFile = File(...),
    _auth: None = Depends(require_auth),
) -> dict[str, Any]:
    """Upload short inspection photo/video/audio clip attached to a 3D pin or timeline event."""
    room_dir = safe_room_storage_dir(room_id)
    if not room_store.get(room_id):
        raise HTTPException(status_code=404, detail="Room not found")

    orig = Path(file.filename or "clip.jpg").name
    ext = Path(orig).suffix.lower() or ".jpg"
    if ext not in config.SUPPORTED_MEDIA_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 미디어 형식입니다: {ext}")

    media_dir = room_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    saved_name = f"{uuid.uuid4().hex[:10]}{ext}"
    dest = media_dir / saved_name
    size_bytes = await _save_upload_with_limit(file, dest, config.MAX_MEDIA_BYTES)

    url = f"{config.STORAGE_URL_PREFIX}/{room_id}/media/{saved_name}"
    if is_r2_enabled():
        url = upload_file_to_r2(dest, f"rooms/{room_id}/media/{saved_name}", file.content_type) or url

    media_type = "video" if ext in (".mp4", ".mov", ".webm") else ("audio" if ext == ".m4a" else "image")
    return {"url": url, "mediaType": media_type, "sizeBytes": size_bytes}
