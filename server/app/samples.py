"""Demo rooms seeded on first startup (generated splat/ply files + metadata)."""

from pathlib import Path
from typing import Any, Callable

from pipeline import convert_splat_to_spz, generate_sample_room_1, generate_sample_room_2

from .config import STORAGE_DIR, storage_url

Room = dict[str, Any]

_SAMPLES: list[dict[str, Any]] = [
    {
        "generator": generate_sample_room_1,
        "meta": {
            "id": "sample-yeoksam-2room",
            "title": "역삼역 도보 6분 채광 좋은 남향 투룸",
            "address": "서울 강남구 역삼동 735-xx (4층)",
            "dealType": "월세",
            "deposit": 3000,
            "monthlyRent": 115,
            "maintenanceFee": 10,
            "areaPyeong": 14.5,
            "roomStructure": "투룸 (거실+침실 분리)",
            "floor": "4층 / 5층",
            "direction": "남향",
            "latitude": 37.5007,
            "longitude": 127.0365,
            "locationLabel": "서울 강남구 역삼동",
            "sunHeadingOffsetDeg": 0.0,
            "MoveInDate": "즉시 입주 가능",
            "rating": 4.7,
            "pros": "남향 통창이라 오후까지 채광 최고, 거실과 침실 완전 분리, 붙박이장 넉넉함",
            "cons": "엘리베이터 없음(4층), 주차 공간 협소",
            "memo": "냉장고 자리 폭 78cm 확인 완료. 소파 3인용 충분히 들어감.",
            "checklist": {
                "sunlight": "good",
                "waterPressure": "good",
                "soundproof": "good",
                "mold": "good",
                "security": "normal",
                "parking": "bad",
            },
            "pins": [
                {
                    "id": "pin-1",
                    "label": "남향 통창 (채광 매우 좋음, 이중창 방음 양호)",
                    "category": "check",
                    "position": [-1.4, 0.2, -2.2],
                },
                {
                    "id": "pin-2",
                    "label": "3인용 패브릭 소파 배치 가능 구간 (폭 2.3m)",
                    "category": "size",
                    "position": [-1.9, -0.6, -0.2],
                },
                {
                    "id": "pin-3",
                    "label": "퀸사이즈 침대 + 붙박이장 동선 여유",
                    "category": "info",
                    "position": [1.95, -0.5, -1.1],
                },
            ],
            "furnitures": [
                {
                    "id": "furn-1",
                    "name": "퀸 침대",
                    "widthM": 1.5,
                    "depthM": 2.0,
                    "heightM": 0.55,
                    "position": [1.95, -0.96, -1.15],
                    "rotationY": 0,
                    "color": "#0284c7",
                },
                {
                    "id": "furn-2",
                    "name": "3인 소파",
                    "widthM": 0.85,
                    "depthM": 2.1,
                    "heightM": 0.75,
                    "position": [-2.1, -0.86, -0.2],
                    "rotationY": 0,
                    "color": "#d97706",
                },
            ],
            "roomPlan": {
                "source": "apple_roomplan",
                "widthM": 6.4,
                "depthM": 4.8,
                "ceilingHeightM": 2.5,
                "walls": [
                    {"id": "w1", "x1": -3.2, "z1": -2.4, "x2": 3.2, "z2": -2.4, "lengthM": 6.4, "heightM": 2.5},
                    {"id": "w2", "x1": 3.2, "z1": -2.4, "x2": 3.2, "z2": 2.4, "lengthM": 4.8, "heightM": 2.5},
                    {"id": "w3", "x1": 3.2, "z1": 2.4, "x2": -3.2, "z2": 2.4, "lengthM": 6.4, "heightM": 2.5},
                    {"id": "w4", "x1": -3.2, "z1": 2.4, "x2": -3.2, "z2": -2.4, "lengthM": 4.8, "heightM": 2.5},
                    {"id": "w5", "x1": 0.4, "z1": -2.4, "x2": 0.4, "z2": 0.5, "lengthM": 2.9, "heightM": 2.5},
                ],
                "openings": [
                    {"id": "win-1", "type": "window", "x": -1.4, "z": -2.4, "widthM": 2.6, "rotationDeg": 0},
                    {"id": "door-1", "type": "door", "x": 0.4, "z": 1.1, "widthM": 0.9, "rotationDeg": 90},
                    {"id": "door-2", "type": "door", "x": -2.4, "z": 2.4, "widthM": 0.95, "rotationDeg": 0},
                ],
                "objects": [
                    {"id": "o1", "label": "소파", "x": -2.1, "z": -0.2, "widthM": 0.85, "depthM": 2.1, "heightM": 0.72, "rotationDeg": 0},
                    {"id": "o2", "label": "아일랜드 식탁", "x": -1.5, "z": 1.75, "widthM": 2.2, "depthM": 0.75, "heightM": 0.88, "rotationDeg": 0},
                    {"id": "o3", "label": "퀸 침대", "x": 1.95, "z": -1.15, "widthM": 1.65, "depthM": 2.05, "heightM": 0.55, "rotationDeg": 0},
                    {"id": "o4", "label": "붙박이장", "x": 2.82, "z": 1.05, "widthM": 0.62, "depthM": 1.85, "heightM": 2.15, "rotationDeg": 0},
                ],
            },
        },
        "createdAt": "2026-11-12T13:00:00+09:00",
    },
    {
        "generator": generate_sample_room_2,
        "meta": {
            "id": "sample-yeonnam-15room",
            "title": "연남동 경의선숲길 인근 감성 테라스 1.5룸",
            "address": "서울 마포구 연남동 241-xx (3층)",
            "dealType": "월세",
            "deposit": 2000,
            "monthlyRent": 95,
            "maintenanceFee": 8,
            "areaPyeong": 11.2,
            "roomStructure": "1.5룸 (우드 파티션 분리)",
            "floor": "3층 / 4층",
            "direction": "남동향",
            "latitude": 37.5618,
            "longitude": 126.9248,
            "locationLabel": "서울 마포구 연남동",
            "sunHeadingOffsetDeg": 0.0,
            "MoveInDate": "12월 초 협의",
            "rating": 4.3,
            "pros": "인테리어 리모델링 완료, 통유리 개방감 우수, 우드 파티션으로 침실 공간 분리",
            "cons": "수납장이 역삼 매물보다 적음, 주말 주변 골목 유동인구 있음",
            "memo": "데스크 존에 1600 책상 들어감. 싱크대 수압 짱짱함.",
            "checklist": {
                "sunlight": "good",
                "waterPressure": "good",
                "soundproof": "normal",
                "mold": "good",
                "security": "good",
                "parking": "normal",
            },
            "pins": [
                {
                    "id": "pin-201",
                    "label": "통유리 테라스 창문 (결로/곰팡이 흔적 없음)",
                    "category": "check",
                    "position": [0.0, 0.2, -2.0],
                },
                {
                    "id": "pin-202",
                    "label": "우드 가벽 파티션 (침실 시선 차단)",
                    "category": "info",
                    "position": [0.45, -0.2, -0.9],
                },
                {
                    "id": "pin-203",
                    "label": "워크스테이션 데스크 자리 (콘센트 4구 위치)",
                    "category": "size",
                    "position": [-1.6, -0.6, 0.25],
                },
            ],
            "furnitures": [
                {
                    "id": "furn-201",
                    "name": "데스크 1400",
                    "widthM": 0.72,
                    "depthM": 1.45,
                    "heightM": 0.75,
                    "position": [-1.65, -0.9, 0.25],
                    "rotationY": 0,
                    "color": "#0284c7",
                },
            ],
            "roomPlan": {
                "source": "apple_roomplan",
                "widthM": 5.2,
                "depthM": 4.4,
                "ceilingHeightM": 2.6,
                "walls": [
                    {"id": "w1", "x1": -2.6, "z1": -2.2, "x2": 2.6, "z2": -2.2, "lengthM": 5.2, "heightM": 2.6},
                    {"id": "w2", "x1": 2.6, "z1": -2.2, "x2": 2.6, "z2": 2.2, "lengthM": 4.4, "heightM": 2.6},
                    {"id": "w3", "x1": 2.6, "z1": 2.2, "x2": -2.6, "z2": 2.2, "lengthM": 5.2, "heightM": 2.6},
                    {"id": "w4", "x1": -2.6, "z1": 2.2, "x2": -2.6, "z2": -2.2, "lengthM": 4.4, "heightM": 2.6},
                    {"id": "w5", "x1": 0.45, "z1": -2.0, "x2": 0.45, "z2": 0.1, "lengthM": 2.1, "heightM": 1.85},
                ],
                "openings": [
                    {"id": "win-1", "type": "window", "x": 0.0, "z": -2.2, "widthM": 3.4, "rotationDeg": 0},
                    {"id": "door-1", "type": "door", "x": -1.8, "z": 2.2, "widthM": 0.9, "rotationDeg": 0},
                ],
                "objects": [
                    {"id": "o1", "label": "데스크", "x": -1.65, "z": 0.25, "widthM": 0.72, "depthM": 1.45, "heightM": 0.76, "rotationDeg": 0},
                    {"id": "o2", "label": "침대", "x": 1.45, "z": -0.85, "widthM": 1.5, "depthM": 2.0, "heightM": 0.52, "rotationDeg": 0},
                    {"id": "o3", "label": "싱크대", "x": 1.2, "z": 1.72, "widthM": 1.9, "depthM": 0.68, "heightM": 0.88, "rotationDeg": 0},
                ],
            },
        },
        "createdAt": "2026-11-12T13:30:00+09:00",
    },
]


def _build_sample(spec: dict[str, Any], storage_dir: Path) -> Room:
    meta = spec["meta"]
    room_id = meta["id"]
    room_dir = storage_dir / room_id
    room_dir.mkdir(parents=True, exist_ok=True)
    generate: Callable[[Path, Path], int] = spec["generator"]
    splat_path = room_dir / "scene.splat"
    splat_count = generate(splat_path, room_dir / "scene.ply")
    spz_url = None
    try:
        convert_splat_to_spz(splat_path, room_dir / "scene.spz")
        spz_url = storage_url(room_id, "scene.spz")
    except Exception:
        spz_url = None

    sample_neighbors = meta.get("neighborBuildings")
    if sample_neighbors is None:
        if room_id == "sample-yeoksam-2room":
            sample_neighbors = [
                {
                    "id": "nb-south-villa",
                    "name": "남측 앞 건물 (예시 · 4층 빌라)",
                    "xM": -2.5,
                    "zM": 13.5,
                    "widthM": 12.0,
                    "depthM": 9.0,
                    "heightM": 13.5,
                    "floors": 4,
                    "distanceM": 13.7,
                    "source": "manual",
                },
                {
                    "id": "nb-southwest-apt",
                    "name": "남서측 인접 건물 (예시 · 5층)",
                    "xM": -14.0,
                    "zM": 11.0,
                    "widthM": 10.0,
                    "depthM": 11.0,
                    "heightM": 16.5,
                    "floors": 5,
                    "distanceM": 17.8,
                    "source": "manual",
                },
            ]
        else:
            sample_neighbors = []

    return {
        **meta,
        "neighborBuildings": sample_neighbors,
        "timeline": meta.get(
            "timeline",
            [
                {
                    "id": f"{room_id}-tl-1",
                    "stage": "viewing",
                    "title": "초기 임장 · 3D 스캔 및 채광 측정",
                    "note": "창문 방위 확인 및 가구 배치 시뮬레이션 완료",
                    "createdAt": spec["createdAt"],
                }
            ],
        ),
        "status": "ready",
        "progress": 100,
        "stageText": f"샘플 데모 방 ({splat_count:,} splats)",
        "splatUrl": storage_url(room_id, "scene.splat"),
        "spzUrl": spz_url,
        "plyUrl": storage_url(room_id, "scene.ply"),
        "videoUrl": None,
        "thumbUrl": None,
        "splatCount": splat_count,
        "engine": "sample_demo",
        "createdAt": spec["createdAt"],
    }


def build_sample_rooms(storage_dir: Path = STORAGE_DIR) -> list[Room]:
    """Generate the sample scene files and return their room records."""
    return [_build_sample(spec, storage_dir) for spec in _SAMPLES]
