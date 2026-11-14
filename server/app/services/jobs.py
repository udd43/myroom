"""Serialized background video -> 3D conversion job queue (OOM protection on 1 GB RAM)."""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

from pipeline import process_video_to_3d

from .. import config
from .r2_storage import is_r2_enabled, upload_file_to_r2
from ..store import room_store

_conversion_semaphore = threading.Semaphore(config.MAX_CONCURRENT_CONVERSIONS)
_queue_lock = threading.Lock()
_queued_count = 0
_active_count = 0


def get_queue_status() -> dict[str, int]:
    with _queue_lock:
        return {
            "maxConcurrent": config.MAX_CONCURRENT_CONVERSIONS,
            "activeJobs": _active_count,
            "queuedJobs": _queued_count,
        }


def run_video_to_3d_job(
    room_id: str,
    video_path: Path,
    workspace_dir: Path,
    room_dir: Path,
    quality: str = "high",
) -> None:
    """Serialize heavy 3D reconstruction jobs with Semaphore(1) so 1 GB RAM stays safe."""
    global _queued_count, _active_count

    with _queue_lock:
        _queued_count += 1
        waiting_ahead = _active_count > 0 or _queued_count > config.MAX_CONCURRENT_CONVERSIONS

    if waiting_ahead:
        room_store.update_progress(
            room_id,
            5,
            "변환 대기열에서 순서 대기 중 (동시 1건 제한 · 메모리 보호)...",
            {"status": "queued"},
        )

    acquired = False
    try:
        _conversion_semaphore.acquire()
        acquired = True
        with _queue_lock:
            _queued_count = max(0, _queued_count - 1)
            _active_count += 1

        splat_path = room_dir / "scene.splat"
        spz_path = room_dir / "scene.spz"
        ply_path = room_dir / "scene.ply"
        thumb_path = room_dir / "thumb.jpg"

        def on_progress(pct: int, msg: str) -> None:
            room_store.update_progress(room_id, pct, msg, {"status": "processing"})

        room_store.update_progress(room_id, 8, "3D 공간 변환 파이프라인 시작...", {"status": "processing"})
        result = process_video_to_3d(
            video_path=video_path,
            workspace_dir=workspace_dir,
            output_splat_path=splat_path,
            output_ply_path=ply_path,
            thumb_path=thumb_path,
            quality=quality,
            on_progress=on_progress,
        )

        cb = int(time.time())
        splat_url = config.storage_url(room_id, "scene.splat", cache_bust=cb) if splat_path.exists() else None
        spz_url = config.storage_url(room_id, "scene.spz", cache_bust=cb) if spz_path.exists() else None
        ply_url = config.storage_url(room_id, "scene.ply", cache_bust=cb) if ply_path.exists() else None
        thumb_url = config.storage_url(room_id, "thumb.jpg", cache_bust=cb) if thumb_path.exists() else None

        # Optional Cloudflare R2 offload if configured
        if is_r2_enabled():
            if spz_path.exists():
                spz_url = upload_file_to_r2(spz_path, f"rooms/{room_id}/scene.spz", "application/octet-stream") or spz_url
            if splat_path.exists():
                splat_url = upload_file_to_r2(splat_path, f"rooms/{room_id}/scene.splat", "application/octet-stream") or splat_url
            if thumb_path.exists():
                thumb_url = upload_file_to_r2(thumb_path, f"rooms/{room_id}/thumb.jpg", "image/jpeg") or thumb_url

        splat_count = int(result.get("splat_count", 0))
        engine = str(result.get("engine", "hybrid_volumetric"))

        room_store.update_progress(
            room_id,
            100,
            f"3D 스캔 변환 완료 ({splat_count:,} splats)",
            {
                "status": "ready",
                "splatUrl": splat_url,
                "spzUrl": spz_url,
                "plyUrl": ply_url,
                "thumbUrl": thumb_url,
                "splatCount": splat_count,
                "engine": engine,
            },
        )
    except Exception as exc:
        room_store.update_progress(
            room_id,
            0,
            f"3D 변환 실패: {exc}",
            {"status": "error"},
        )
    finally:
        with _queue_lock:
            if acquired:
                _active_count = max(0, _active_count - 1)
            else:
                _queued_count = max(0, _queued_count - 1)
        if acquired:
            _conversion_semaphore.release()
