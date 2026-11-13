"""Thread-safe JSON-file repository for rooms."""

import json
import os
import threading
from pathlib import Path
from typing import Any, Callable

from .config import DATA_FILE

Room = dict[str, Any]


class RoomStore:
    """Persists rooms in a single JSON file guarded by a re-entrant lock.

    Every mutation is a read-modify-write cycle performed under the lock, so
    request handlers and background workers can safely share one instance.
    """

    def __init__(self, data_file: Path) -> None:
        self._data_file = data_file
        self._lock = threading.RLock()

    # -- low-level IO (callers must hold the lock when mutating) ------------
    def _load(self) -> list[Room]:
        if not self._data_file.exists():
            return []
        try:
            with open(self._data_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, rooms: list[Room]) -> None:
        tmp = self._data_file.with_name(self._data_file.name + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rooms, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self._data_file)

    def _mutate_room(self, room_id: str, fn: Callable[[Room], None]) -> Room | None:
        """Apply ``fn`` to the room with ``room_id`` and persist. None if missing."""
        with self._lock:
            rooms = self._load()
            for room in rooms:
                if room["id"] == room_id:
                    fn(room)
                    self._save(rooms)
                    return room
        return None

    # -- queries -------------------------------------------------------------
    def list_rooms(self) -> list[Room]:
        with self._lock:
            return self._load()

    def get(self, room_id: str) -> Room | None:
        return next((r for r in self.list_rooms() if r["id"] == room_id), None)

    # -- commands ------------------------------------------------------------
    def seed_if_empty(self, factory: Callable[[], list[Room]]) -> bool:
        """Populate the store with ``factory()`` when it holds no rooms."""
        with self._lock:
            if self._load():
                return False
            self._save(factory())
            return True

    def insert(self, room: Room) -> Room:
        with self._lock:
            rooms = self._load()
            rooms.insert(0, room)
            self._save(rooms)
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
            rooms = [r for r in self._load() if r["id"] != room_id]
            self._save(rooms)

    def add_pin(self, room_id: str, pin: dict[str, Any]) -> Room | None:
        return self._mutate_room(room_id, lambda room: room.setdefault("pins", []).append(pin))

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


room_store = RoomStore(DATA_FILE)
