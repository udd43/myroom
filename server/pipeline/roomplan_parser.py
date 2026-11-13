"""
Apple RoomPlan CapturedRoom JSON 파서 및 2D/3D 건축 평면도(Floorplan) 변환 모듈.
아이폰 15 Pro의 LiDAR RoomPlan 스캔 JSON (walls, doors, windows, objects)을 읽어
웹 2D 도면 뷰어(SVG) 및 3D 가구 배치와 즉시 호환되는 구조로 변환합니다.
"""

import json
import math
from pathlib import Path
from typing import Any


def _extract_2d_pose(transform: list[float] | list[list[float]]) -> tuple[float, float, float]:
    """
    Apple RoomPlan 4x4 column-major transform에서 (x, z, yaw_deg)를 추출합니다.
    """
    flat: list[float] = []
    if transform and isinstance(transform[0], list):
        for col in transform:
            flat.extend(col)  # type: ignore
    else:
        flat = [float(x) for x in transform]  # type: ignore

    if len(flat) < 16:
        return 0.0, 0.0, 0.0

    tx = float(flat[12])
    tz = float(flat[14])
    yaw_rad = math.atan2(float(flat[8]), float(flat[0]))
    return round(tx, 3), round(tz, 3), round(math.degrees(yaw_rad), 1)


def parse_roomplan_json(json_path: Path) -> dict[str, Any]:
    with open(json_path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    # 이미 MyRoom 정규화 포맷인 경우 그대로 반환
    if "widthM" in raw and "walls" in raw and isinstance(raw["walls"], list):
        if not raw["walls"] or "x1" in raw["walls"][0]:
            return raw

    walls_out = []
    for i, w in enumerate(raw.get("walls", [])):
        dims = w.get("dimensions", [2.0, 2.5, 0.15])
        length = float(dims[0]) if dims else 2.0
        height = float(dims[1]) if len(dims) > 1 else 2.5
        cx, cz, yaw_deg = _extract_2d_pose(w.get("transform", []))
        rad = math.radians(yaw_deg)
        dx = (length / 2.0) * math.cos(rad)
        dz = (length / 2.0) * math.sin(rad)
        walls_out.append(
            {
                "id": w.get("identifier", f"w-{i}"),
                "x1": round(cx - dx, 2),
                "z1": round(cz - dz, 2),
                "x2": round(cx + dx, 2),
                "z2": round(cz + dz, 2),
                "lengthM": round(length, 2),
                "heightM": round(height, 2),
            }
        )

    openings_out = []
    for kind, key in (("door", "doors"), ("window", "windows")):
        for i, item in enumerate(raw.get(key, [])):
            dims = item.get("dimensions", [0.9, 2.1, 0.1])
            width = float(dims[0]) if dims else 0.9
            cx, cz, yaw_deg = _extract_2d_pose(item.get("transform", []))
            openings_out.append(
                {
                    "id": item.get("identifier", f"{kind}-{i}"),
                    "type": kind,
                    "x": cx,
                    "z": cz,
                    "widthM": round(width, 2),
                    "rotationDeg": yaw_deg,
                }
            )

    objects_out = []
    for i, obj in enumerate(raw.get("objects", [])):
        dims = obj.get("dimensions", [0.8, 0.8, 0.8])
        w_m = float(dims[0]) if dims else 0.8
        h_m = float(dims[1]) if len(dims) > 1 else 0.8
        d_m = float(dims[2]) if len(dims) > 2 else 0.8
        cx, cz, yaw_deg = _extract_2d_pose(obj.get("transform", []))
        cat = obj.get("category", {})
        label = next(iter(cat.keys()), "가구") if isinstance(cat, dict) and cat else str(cat or "가구")
        objects_out.append(
            {
                "id": obj.get("identifier", f"obj-{i}"),
                "label": label,
                "x": cx,
                "z": cz,
                "widthM": round(w_m, 2),
                "depthM": round(d_m, 2),
                "heightM": round(h_m, 2),
                "rotationDeg": yaw_deg,
            }
        )

    xs = [w["x1"] for w in walls_out] + [w["x2"] for w in walls_out]
    zs = [w["z1"] for w in walls_out] + [w["z2"] for w in walls_out]
    width_m = round((max(xs) - min(xs)) if xs else 5.4, 2)
    depth_m = round((max(zs) - min(zs)) if zs else 4.5, 2)

    return {
        "source": "apple_roomplan",
        "widthM": width_m,
        "depthM": depth_m,
        "ceilingHeightM": 2.5,
        "walls": walls_out,
        "openings": openings_out,
        "objects": objects_out,
    }

