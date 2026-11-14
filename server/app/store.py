"""SQLite (WAL mode) persistent room metadata store with automatic rooms.json migration."""

from __future__ import annotations

import json
import secrets
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterator

from .config import DATA_FILE, DB_FILE, TIMEZONE_SUFFIX, is_safe_id

Room = dict[str, Any]


def _now_iso() -> str:
    return datetime.now().strftime(f"%Y-%m-%dT%H:%M:%S{TIMEZONE_SUFFIX}")


class RoomStore:
    """Thread-safe SQLite (WAL) store preserving the RoomStore API."""

    def __init__(self, path: Path = DB_FILE, legacy_json_path: Path | None = DATA_FILE) -> None:
        if path.suffix.lower() == ".json":
            self.db_path = path.with_suffix(".db")
            self.legacy_json_path: Path | None = path
        else:
            self.db_path = path
            self.legacy_json_path = legacy_json_path
        self._lock = threading.Lock()
        self._initialized = False

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=15.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA busy_timeout=5000;")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _ensure_schema_unlocked(self, conn: sqlite3.Connection) -> None:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                share_token TEXT UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                data_json TEXT NOT NULL
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_rooms_share_token ON rooms(share_token);")
        conn.commit()

        # One-time automatic migration from legacy rooms.json if SQLite table is empty
        if not self._initialized:
            self._initialized = True
            count = conn.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
            if count == 0 and self.legacy_json_path and self.legacy_json_path.is_file():
                try:
                    raw = self.legacy_json_path.read_text(encoding="utf-8")
                    loaded = json.loads(raw)
                    if isinstance(loaded, list) and loaded:
                        now = _now_iso()
                        for room in loaded:
                            if not isinstance(room, dict) or "id" not in room:
                                continue
                            share_tok = room.get("shareToken")
                            created = str(room.get("createdAt") or now)
                            updated = str(room.get("updatedAt") or created)
                            conn.execute(
                                """
                                INSERT OR IGNORE INTO rooms (id, share_token, created_at, updated_at, data_json)
                                VALUES (?, ?, ?, ?, ?)
                                """,
                                (room["id"], share_tok, created, updated, json.dumps(room, ensure_ascii=False)),
                            )
                        conn.commit()
                except (OSError, json.JSONDecodeError):
                    pass

    def _row_to_room(self, row: sqlite3.Row) -> Room:
        room = json.loads(row["data_json"])
        if row["share_token"] and not room.get("shareToken"):
            room["shareToken"] = row["share_token"]
        return room

    def list_rooms(self) -> list[Room]:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                rows = conn.execute(
                    "SELECT data_json, share_token FROM rooms ORDER BY created_at DESC"
                ).fetchall()
                return [self._row_to_room(r) for r in rows]

    def get(self, room_id: str) -> Room | None:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                row = conn.execute(
                    "SELECT data_json, share_token FROM rooms WHERE id = ?",
                    (room_id,),
                ).fetchone()
                return self._row_to_room(row) if row else None

    def get_by_share_token(self, token: str) -> Room | None:
        if not token:
            return None
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                row = conn.execute(
                    "SELECT data_json, share_token FROM rooms WHERE share_token = ?",
                    (token,),
                ).fetchone()
                return self._row_to_room(row) if row else None

    def seed_if_empty(self, factory: Callable[[], list[Room]]) -> None:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                count = conn.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
                if count > 0:
                    return
                samples = factory()
                now = _now_iso()
                for room in samples:
                    created = str(room.get("createdAt") or now)
                    updated = str(room.get("updatedAt") or created)
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO rooms (id, share_token, created_at, updated_at, data_json)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (room["id"], room.get("shareToken"), created, updated, json.dumps(room, ensure_ascii=False)),
                    )
                conn.commit()

    def insert(self, room: Room) -> Room:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                now = _now_iso()
                room.setdefault("createdAt", now)
                room.setdefault("updatedAt", now)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO rooms (id, share_token, created_at, updated_at, data_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        room["id"],
                        room.get("shareToken"),
                        str(room["createdAt"]),
                        str(room["updatedAt"]),
                        json.dumps(room, ensure_ascii=False),
                    ),
                )
                conn.commit()
        return room

    def upsert_many(self, rooms: list[Room]) -> list[Room]:
        """Bulk insert or skip existing rooms for offline localStorage -> server sync."""
        synced: list[Room] = []
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                now = _now_iso()
                for room in rooms:
                    rid = str(room.get("id") or "").strip()
                    if not rid or not is_safe_id(rid):
                        continue
                    existing = conn.execute("SELECT id FROM rooms WHERE id = ?", (rid,)).fetchone()
                    if existing:
                        continue
                    record = dict(room)
                    # Local-only placeholder URLs can't be served globally; reset gracefully
                    if str(record.get("splatUrl", "")).startswith("local-idb://"):
                        record["splatUrl"] = None
                    if str(record.get("videoUrl", "")).startswith("local-idb://"):
                        record["videoUrl"] = None
                    record.setdefault("createdAt", now)
                    record["updatedAt"] = now
                    conn.execute(
                        """
                        INSERT INTO rooms (id, share_token, created_at, updated_at, data_json)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            rid,
                            record.get("shareToken"),
                            str(record["createdAt"]),
                            str(record["updatedAt"]),
                            json.dumps(record, ensure_ascii=False),
                        ),
                    )
                    synced.append(record)
                conn.commit()
        return synced

    def _mutate_room(self, room_id: str, mutator: Callable[[Room], None]) -> Room | None:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                row = conn.execute(
                    "SELECT data_json, share_token, created_at FROM rooms WHERE id = ?",
                    (room_id,),
                ).fetchone()
                if not row:
                    return None
                room = self._row_to_room(row)
                mutator(room)
                now = _now_iso()
                room["updatedAt"] = now
                conn.execute(
                    """
                    UPDATE rooms
                    SET share_token = ?, updated_at = ?, data_json = ?
                    WHERE id = ?
                    """,
                    (room.get("shareToken"), now, json.dumps(room, ensure_ascii=False), room_id),
                )
                conn.commit()
                return room

    def update(self, room_id: str, updates: dict[str, Any]) -> Room | None:
        """Apply non-None ``updates`` to a room."""

        def apply(room: Room) -> None:
            for key, value in updates.items():
                if value is not None:
                    room[key] = value

        return self._mutate_room(room_id, apply)

    def delete(self, room_id: str) -> None:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                conn.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
                conn.commit()

    def add_pin(self, room_id: str, pin: dict[str, Any]) -> Room | None:
        return self._mutate_room(room_id, lambda room: room.setdefault("pins", []).append(pin))

    def remove_pin(self, room_id: str, pin_id: str) -> Room | None:
        def apply(room: Room) -> None:
            pins = room.get("pins") or []
            room["pins"] = [p for p in pins if p.get("id") != pin_id]

        return self._mutate_room(room_id, apply)

    def add_timeline_event(self, room_id: str, event: dict[str, Any]) -> Room | None:
        def apply(room: Room) -> None:
            tl = room.setdefault("timeline", [])
            tl.append(event)

        return self._mutate_room(room_id, apply)

    def remove_timeline_event(self, room_id: str, event_id: str) -> Room | None:
        def apply(room: Room) -> None:
            tl = room.get("timeline") or []
            room["timeline"] = [e for e in tl if e.get("id") != event_id]

        return self._mutate_room(room_id, apply)

    def ensure_share_token(self, room_id: str, regenerate: bool = False) -> Room | None:
        def apply(room: Room) -> None:
            if regenerate or not room.get("shareToken"):
                room["shareToken"] = secrets.token_urlsafe(12)

        return self._mutate_room(room_id, apply)

    def revoke_share_token(self, room_id: str) -> Room | None:
        def apply(room: Room) -> None:
            room.pop("shareToken", None)

        return self._mutate_room(room_id, apply)

    def update_progress(
        self,
        room_id: str,
        progress: int,
        stage_text: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        def apply(room: Room) -> None:
            room["progress"] = progress
            room["stageText"] = stage_text
            if extra:
                room.update(extra)

        self._mutate_room(room_id, apply)

    def db_stats(self) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                self._ensure_schema_unlocked(conn)
                mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
                count = conn.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
                return {"backend": "sqlite", "journalMode": mode, "roomCount": count}


room_store = RoomStore(DB_FILE, legacy_json_path=DATA_FILE)
