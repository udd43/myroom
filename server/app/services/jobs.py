"""Background video -> 3D processing jobs."""

import threading
import time
from pathlib import Path

from pipeline import process_video_to_3d

from ..config import storage_url
from ..store import RoomStore


def run_video_job(store: RoomStore, room_id: str, room_dir: Path, video_path: Path, quality: str) -> None:
    """Convert an uploaded video into a splat scene, reporting progress to the store."""
    splat_path = room_dir / "scene.splat"
    ply_path = room_dir / "scene.ply"
    thumb_path = room_dir / "thumb.jpg"

    try:
        res = process_video_to_3d(
            video_path=video_path,
            workspace_dir=room_dir / "colmap_ws",
            output_splat_path=splat_path,
            output_ply_path=ply_path,
            thumb_path=thumb_path,
            quality=quality,
            on_progress=lambda p, msg: store.update_progress(room_id, p, msg),
        )
        ts = int(time.time())
        store.update_progress(
            room_id,
            100,
            f"3D 변환 완료 ({res['splat_count']:,} splats)",
            {
                "status": "ready",
                "splatUrl": storage_url(room_id, "scene.splat", ts),
                "plyUrl": storage_url(room_id, "scene.ply", ts),
                "thumbUrl": storage_url(room_id, "thumb.jpg", ts) if thumb_path.exists() else None,
                "splatCount": res["splat_count"],
                "engine": res["engine"],
            },
        )
    except Exception as e:
        store.update_progress(room_id, 0, f"변환 중 오류 발생: {e}", {"status": "error"})


def start_video_job(store: RoomStore, room_id: str, room_dir: Path, video_path: Path, quality: str) -> threading.Thread:
    thread = threading.Thread(
        target=run_video_job,
        args=(store, room_id, room_dir, video_path, quality),
        daemon=True,
    )
    thread.start()
    return thread
