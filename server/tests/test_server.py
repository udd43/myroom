"""Backend unit & ASGI integration tests (SQLite WAL, rooms.json migration, HMAC auth, share links, limits, SPZ)."""

from __future__ import annotations

import asyncio
import gzip
import json
import shutil
import struct
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import patch

import numpy as np

SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from app import application, config
from app.services import korea_apis, r2_storage
from app.store import RoomStore
from pipeline.splat_converter import SPZ_MAGIC, convert_splat_to_spz, write_splat_file


async def _asgi_request(
    app: Any,
    method: str,
    path: str,
    headers: dict[str, str] | None = None,
    body: bytes = b"",
) -> tuple[int, dict[str, str], bytes]:
    raw_headers = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    }
    sent = False

    async def receive() -> dict[str, Any]:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    status = 500
    resp_headers: dict[str, str] = {}
    chunks: list[bytes] = []

    async def send(msg: dict[str, Any]) -> None:
        nonlocal status
        if msg["type"] == "http.response.start":
            status = int(msg["status"])
            for k, v in msg.get("headers", []):
                resp_headers[k.decode("latin-1")] = v.decode("latin-1")
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    await app(scope, receive, send)
    return status, resp_headers, b"".join(chunks)


def _multipart_body(field_name: str, filename: str, content_type: str, content: bytes) -> tuple[str, bytes]:
    boundary = f"----myroom-{uuid.uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    return f"multipart/form-data; boundary={boundary}", body


class ServerBackendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="myroom_test_"))
        self.storage_dir = self.tmp / "storage"
        self.data_dir = self.tmp / "data"
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db_file = self.data_dir / "myroom.db"
        self.legacy_json = self.data_dir / "rooms.json"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_sqlite_wal_and_legacy_json_migration(self) -> None:
        legacy_rooms = [
            {
                "id": "legacy-room-1",
                "title": "기존 JSON 방",
                "deposit": 1000,
                "monthlyRent": 60,
                "maintenanceFee": 5,
                "areaPyeong": 8.0,
                "createdAt": "2026-01-01T10:00:00+09:00",
            }
        ]
        self.legacy_json.write_text(json.dumps(legacy_rooms, ensure_ascii=False), encoding="utf-8")

        store = RoomStore(self.db_file, legacy_json_path=self.legacy_json)
        stats = store.db_stats()
        self.assertEqual(stats["backend"], "sqlite")
        self.assertEqual(stats["journalMode"].lower(), "wal")
        self.assertEqual(stats["roomCount"], 1)

        rooms = store.list_rooms()
        self.assertEqual(len(rooms), 1)
        self.assertEqual(rooms[0]["title"], "기존 JSON 방")

        updated = store.update("legacy-room-1", {"monthlyRent": 55, "memo": "네고 완료"})
        self.assertIsNotNone(updated)
        self.assertEqual(store.get("legacy-room-1")["monthlyRent"], 55)  # type: ignore[index]

    def test_auth_lock_share_link_and_upload_limits(self) -> None:
        store = RoomStore(self.db_file, legacy_json_path=self.legacy_json)
        store.insert(
            {
                "id": "room-auth-1",
                "title": "잠금 테스트 방",
                "address": "서울 마포구",
                "dealType": "월세",
                "deposit": 2000,
                "monthlyRent": 80,
                "maintenanceFee": 8,
                "areaPyeong": 10.0,
                "checklist": {},
                "pins": [],
            }
        )

        with (
            patch.object(config, "STORAGE_DIR", self.storage_dir),
            patch.object(config, "DATA_DIR", self.data_dir),
            patch.object(config, "AUTH_SECRET_FILE", self.data_dir / ".auth_secret"),
            patch.object(config, "ADMIN_PASSWORD", "secret-pass-123"),
            patch.object(config, "AUTH_SECRET", "unit-test-secret"),
            patch.object(config, "MAX_UPLOAD_BYTES", 128),
            patch.object(config, "MAX_UPLOAD_MB", 1),
            patch("app.routers.rooms.room_store", store),
            patch("app.routers.uploads.room_store", store),
            patch("app.routers.health.room_store", store),
            patch("app.application.room_store", store),
        ):
            app = application.create_app()

            def call(method: str, path: str, json_body: Any = None, headers: dict[str, str] | None = None, raw: bytes = b""):
                hdrs = dict(headers or {})
                payload = raw
                if json_body is not None:
                    payload = json.dumps(json_body).encode("utf-8")
                    hdrs["content-type"] = "application/json"
                return asyncio.run(_asgi_request(app, method, path, headers=hdrs, body=payload))

            status, _, _ = call("GET", "/api/rooms")
            self.assertEqual(status, 401)

            status, _, _ = call("POST", "/api/auth/login", json_body={"password": "wrong"})
            self.assertEqual(status, 401)

            status, _, body = call("POST", "/api/auth/login", json_body={"password": "secret-pass-123"})
            self.assertEqual(status, 200)
            token = json.loads(body)["token"]
            auth_headers = {"Authorization": f"Bearer {token}"}

            status, _, body = call("GET", "/api/rooms", headers=auth_headers)
            self.assertEqual(status, 200)
            self.assertEqual(len(json.loads(body)), 1)

            status, _, body = call("POST", "/api/rooms/room-auth-1/share", headers=auth_headers)
            self.assertEqual(status, 200)
            share_tok = json.loads(body)["shareToken"]

            # Public read-only share works WITHOUT auth headers
            status, _, body = call("GET", f"/api/share/{share_tok}")
            self.assertEqual(status, 200)
            shared_payload = json.loads(body)
            self.assertTrue(shared_payload["readOnly"])
            self.assertEqual(shared_payload["room"]["id"], "room-auth-1")

            status, _, body = call(
                "POST",
                "/api/rooms/room-auth-1/pins",
                json_body={"label": "창문 소음 42dB", "category": "check", "position": [0.0, 1.0, 0.0], "noiseDb": 42.3},
                headers=auth_headers,
            )
            self.assertEqual(status, 200)
            self.assertEqual(len(json.loads(body)["pins"]), 1)

            status, _, body = call(
                "POST",
                "/api/rooms/room-auth-1/timeline",
                json_body={"stage": "move_in", "title": "입주일 바닥 스크래치 기록"},
                headers=auth_headers,
            )
            self.assertEqual(status, 200)
            self.assertEqual(len(json.loads(body)["timeline"]), 1)

            # Oversized upload rejected with 413
            ct, mp_big = _multipart_body("file", "big.usdz", "model/vnd.usdz+zip", b"X" * 256)
            status, _, _ = call("POST", "/api/rooms/room-auth-1/upload-3d", headers={**auth_headers, "content-type": ct}, raw=mp_big)
            self.assertEqual(status, 413)

            # Valid small USDZ succeeds
            ct, mp_ok = _multipart_body("file", "room.usdz", "model/vnd.usdz+zip", b"PK\x03\x04demo")
            status, _, body = call("POST", "/api/rooms/room-auth-1/upload-3d", headers={**auth_headers, "content-type": ct}, raw=mp_ok)
            self.assertEqual(status, 200)
            self.assertIn("scene.usdz", json.loads(body)["usdzUrl"])

    def test_spz_v2_compression_header(self) -> None:
        splat_path = self.tmp / "room.splat"
        spz_path = self.tmp / "room.spz"
        pos = np.random.uniform(-2.0, 2.0, size=(120, 3)).astype(np.float32)
        scales = np.full((120, 3), 0.05, dtype=np.float32)
        cols = np.full((120, 4), 200, dtype=np.uint8)
        write_splat_file(splat_path, pos, scales, cols)
        n = convert_splat_to_spz(splat_path, spz_path)
        self.assertEqual(n, 120)
        self.assertLess(spz_path.stat().st_size, splat_path.stat().st_size)

        raw = gzip.decompress(spz_path.read_bytes())
        magic, version, num_pts, sh_deg, frac_bits, flags, _ = struct.unpack("<IIIBBBB", raw[:16])
        self.assertEqual(magic, SPZ_MAGIC)
        self.assertEqual(version, 2)
        self.assertEqual(num_pts, 120)
        self.assertEqual(sh_deg, 0)
        self.assertEqual(frac_bits, 12)
        self.assertEqual(flags, 0)
        self.assertEqual(len(raw), 16 + 120 * 19)

    def test_r2_presign_and_korea_api_parsers(self) -> None:
        with (
            patch.object(config, "R2_ENDPOINT_URL", "https://acct123.r2.cloudflarestorage.com"),
            patch.object(config, "R2_BUCKET", "myroom-assets"),
            patch.object(config, "R2_ACCESS_KEY_ID", "AKIAEXAMPLE"),
            patch.object(config, "R2_SECRET_ACCESS_KEY", "SECRETEXAMPLE"),
            patch.object(config, "R2_PUBLIC_BASE_URL", "https://cdn.example.com"),
        ):
            presign = r2_storage.create_presigned_put_url("rooms/r1/scene.spz", "application/octet-stream")
            self.assertTrue(presign["enabled"])
            self.assertIn("X-Amz-Algorithm=AWS4-HMAC-SHA256", presign["uploadUrl"])
            self.assertIn("X-Amz-Signature=", presign["uploadUrl"])
            self.assertEqual(presign["publicUrl"], "https://cdn.example.com/rooms/r1/scene.spz")

        xml_sample = """<response><header><resultCode>00</resultCode></header><body><items><item>
            <mainPurpsCdNm>제2종근린생활시설</mainPurpsCdNm><useAprDay>20210415</useAprDay><grndFlrCnt>5</grndFlrCnt>
        </item></items></body></response>"""
        err, items = korea_apis._parse_data_go_kr_response(xml_sample)
        self.assertIsNone(err)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["mainPurpsCdNm"], "제2종근린생활시설")


if __name__ == "__main__":
    unittest.main()
