import zlib
from pathlib import Path
import numpy as np
from .splat_converter import write_splat_file, write_ply_file
from .surface_reconstructor import normals_to_quaternions

_FACE_NORMALS: dict[str, tuple[float, float, float]] = {
    "y-": (0.0, -1.0, 0.0),
    "y+": (0.0, 1.0, 0.0),
    "x-": (-1.0, 0.0, 0.0),
    "x+": (1.0, 0.0, 0.0),
    "z-": (0.0, 0.0, -1.0),
    "z+": (0.0, 0.0, 1.0),
}


def _box_surface_splats(
    center: tuple[float, float, float],
    size: tuple[float, float, float],
    color_rgb: tuple[int, int, int],
    density: int = 32,
    alpha: int = 240,
    noise: float = 0.004,
    skip_top: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    cx, cy, cz = center
    sx, sy, sz = size
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0

    pts = []
    cols = []
    scls = []
    qts = []

    rng = np.random.default_rng(zlib.crc32(repr((center, size, color_rgb)).encode("utf-8")))

    faces = [
        ("y-", (cx - hx, cx + hx), (cz - hz, cz + hz), cy - hy),
        ("x-", (cy - hy, cy + hy), (cz - hz, cz + hz), cx - hx),
        ("x+", (cy - hy, cy + hy), (cz - hz, cz + hz), cx + hx),
        ("z-", (cx - hx, cx + hx), (cy - hy, cy + hy), cz - hz),
        ("z+", (cx - hx, cx + hx), (cy - hy, cy + hy), cz + hz),
    ]
    if not skip_top:
        faces.append(("y+", (cx - hx, cx + hx), (cz - hz, cz + hz), cy + hy))

    for axis, r1, r2, fixed in faces:
        l1 = max(0.2, r1[1] - r1[0])
        l2 = max(0.2, r2[1] - r2[0])
        n1 = max(4, int(l1 * density))
        n2 = max(4, int(l2 * density))
        u = np.linspace(r1[0], r1[1], n1)
        v = np.linspace(r2[0], r2[1], n2)
        uu, vv = np.meshgrid(u, v)
        uu = uu.ravel() + rng.normal(0, noise, uu.size)
        vv = vv.ravel() + rng.normal(0, noise, vv.size)
        ff = np.full_like(uu, fixed) + rng.normal(0, noise * 0.25, uu.size)

        if axis.startswith("y"):
            p = np.stack([uu, ff, vv], axis=-1)
        elif axis.startswith("x"):
            p = np.stack([ff, uu, vv], axis=-1)
        else:
            p = np.stack([uu, vv, ff], axis=-1)

        # 2DGS Oriented Surfel 스케일: 접선 XY는 면을 덮고 법선 Z는 극도로 납작하게
        tile_w = 1.38 / density
        sc = np.tile([tile_w, tile_w, 0.003], (uu.size, 1))
        nrm = np.tile(_FACE_NORMALS[axis], (uu.size, 1))
        qt = normals_to_quaternions(nrm)

        shade = 1.0 - 0.07 * np.sin(p[:, 0] * 2.5) + 0.05 * (p[:, 1] / 2.5)
        c = np.zeros((uu.size, 4), dtype=np.float32)
        c[:, 0] = color_rgb[0] * shade + rng.normal(0, 3, uu.size)
        c[:, 1] = color_rgb[1] * shade + rng.normal(0, 3, uu.size)
        c[:, 2] = color_rgb[2] * shade + rng.normal(0, 3, uu.size)
        c[:, 3] = alpha

        pts.append(p)
        cols.append(c)
        scls.append(sc)
        qts.append(qt)

    return (
        np.concatenate(pts, axis=0),
        np.concatenate(scls, axis=0),
        np.clip(np.concatenate(cols, axis=0), 0, 255).astype(np.uint8),
        np.concatenate(qts, axis=0),
    )


def _write_room_parts(
    parts: list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]],
    splat_path: Path,
    ply_path: Path,
) -> int:
    pos = np.concatenate([p[0] for p in parts], axis=0)
    scl = np.concatenate([p[1] for p in parts], axis=0)
    col = np.concatenate([p[2] for p in parts], axis=0)
    qts = np.concatenate([p[3] for p in parts], axis=0)

    write_ply_file(ply_path, pos, col[:, :3])
    return write_splat_file(splat_path, pos, scl, col, quats=qts)


def generate_sample_room_1(splat_path: Path, ply_path: Path) -> int:
    """샘플 매물 1: 강남 역삼 채광 좋은 남향 투룸 (2D Surfel 법선 포함)"""
    parts = [
        _box_surface_splats((0.0, 0.0, 0.0), (6.4, 2.5, 4.8), (238, 234, 226), density=24, alpha=225, skip_top=True),
        _box_surface_splats((0.0, -1.24, 0.0), (6.36, 0.02, 4.76), (186, 148, 108), density=32, alpha=250),
        _box_surface_splats((0.4, 0.0, -0.9), (0.14, 2.48, 2.9), (228, 224, 216), density=26, alpha=245),
        _box_surface_splats((-1.4, 0.15, -2.36), (2.6, 1.5, 0.05), (195, 232, 255), density=34, alpha=210),
        _box_surface_splats((-1.4, -1.22, -1.4), (2.4, 0.01, 1.5), (248, 235, 195), density=30, alpha=190),
        _box_surface_splats((-2.1, -0.88, -0.2), (0.85, 0.72, 2.1), (218, 210, 198), density=32, alpha=250),
        _box_surface_splats((-1.75, -1.0, -0.2), (0.65, 0.42, 2.0), (228, 220, 208), density=32, alpha=250),
        _box_surface_splats((-1.0, -1.22, -0.2), (1.5, 0.02, 1.9), (212, 206, 196), density=30, alpha=245),
        _box_surface_splats((-0.95, -0.98, -0.2), (0.65, 0.45, 1.15), (142, 98, 62), density=34, alpha=250),
        _box_surface_splats((-1.5, -0.8, 1.75), (2.2, 0.88, 0.75), (85, 92, 102), density=30, alpha=250),
        _box_surface_splats((-1.5, -0.34, 1.75), (2.24, 0.05, 0.8), (245, 245, 247), density=34, alpha=255),
        _box_surface_splats((1.95, -0.92, -1.15), (1.65, 0.55, 2.05), (235, 238, 244), density=32, alpha=250),
        _box_surface_splats((1.95, -0.55, -2.1), (1.68, 1.1, 0.12), (135, 95, 62), density=32, alpha=250),
        _box_surface_splats((2.82, -0.15, 1.05), (0.62, 2.15, 1.85), (240, 238, 232), density=28, alpha=248),
    ]
    return _write_room_parts(parts, splat_path, ply_path)


def generate_sample_room_2(splat_path: Path, ply_path: Path) -> int:
    """샘플 매물 2: 마포 연남동 감성 테라스 1.5룸 (2D Surfel 법선 포함)"""
    parts = [
        _box_surface_splats((0.0, 0.0, 0.0), (5.2, 2.6, 4.4), (242, 240, 235), density=24, alpha=225, skip_top=True),
        _box_surface_splats((0.0, -1.29, 0.0), (5.16, 0.02, 4.36), (214, 210, 202), density=32, alpha=250),
        _box_surface_splats((0.0, 0.1, -2.16), (3.4, 1.75, 0.05), (185, 228, 245), density=34, alpha=205),
        _box_surface_splats((-1.95, -0.75, -1.75), (0.48, 1.05, 0.48), (68, 138, 82), density=34, alpha=245),
        _box_surface_splats((1.45, -0.95, -0.85), (1.5, 0.52, 2.0), (208, 218, 228), density=32, alpha=250),
        _box_surface_splats((0.45, -0.35, -0.95), (0.08, 1.85, 2.15), (175, 138, 98), density=28, alpha=225),
        _box_surface_splats((-1.65, -0.88, 0.25), (0.72, 0.76, 1.45), (125, 88, 56), density=34, alpha=250),
        _box_surface_splats((-0.85, -0.92, 0.25), (0.58, 0.72, 0.58), (72, 76, 84), density=34, alpha=250),
        _box_surface_splats((1.2, -0.82, 1.72), (1.9, 0.88, 0.68), (225, 228, 230), density=30, alpha=250),
        _box_surface_splats((-0.1, -0.42, 1.72), (0.68, 1.72, 0.68), (235, 238, 242), density=30, alpha=250),
    ]
    return _write_room_parts(parts, splat_path, ply_path)
