"""
2D Gaussian Splatting (2DGS) & PGSR 기반 표면 법선/Surfel 재구성 모듈.

기존 3DGS가 등방성 구(공) 형태로 렌더링되던 한계를 해결하기 위해,
각 점의 로컬 접평면(Tangent Plane)과 법선(Normal)을 계산해
평면 정렬 회전 쿼터니언(w, x, y, z)과 납작한 2D 디스크 스케일(su, sv, sz≈0.003)을 부여합니다.
"""

from collections import defaultdict
import numpy as np


def basis_to_quaternions(
    t_u: np.ndarray,
    t_v: np.ndarray,
    normals: np.ndarray,
) -> np.ndarray:
    """
    직교 기저 (t_u, t_v, normals) 행렬 [N, 3, 3]을 단위 쿼터니언 [N, 4] (w, x, y, z)로 변환합니다.
    로컬 XY 평면이 (t_u, t_v)에 정렬되고, 로컬 +Z 축이 normal 방향을 향합니다.
    """
    n = len(normals)
    r_mat = np.empty((n, 3, 3), dtype=np.float32)
    r_mat[:, :, 0] = t_u
    r_mat[:, :, 1] = t_v
    r_mat[:, :, 2] = normals

    quats = np.zeros((n, 4), dtype=np.float32)
    trace = r_mat[:, 0, 0] + r_mat[:, 1, 1] + r_mat[:, 2, 2]

    m0 = trace > 0.0
    if np.any(m0):
        s = np.sqrt(np.maximum(1e-8, trace[m0] + 1.0)) * 2.0
        quats[m0, 0] = 0.25 * s
        quats[m0, 1] = (r_mat[m0, 2, 1] - r_mat[m0, 1, 2]) / s
        quats[m0, 2] = (r_mat[m0, 0, 2] - r_mat[m0, 2, 0]) / s
        quats[m0, 3] = (r_mat[m0, 1, 0] - r_mat[m0, 0, 1]) / s

    m1 = (~m0) & (r_mat[:, 0, 0] > r_mat[:, 1, 1]) & (r_mat[:, 0, 0] > r_mat[:, 2, 2])
    if np.any(m1):
        s = np.sqrt(np.maximum(1e-8, 1.0 + r_mat[m1, 0, 0] - r_mat[m1, 1, 1] - r_mat[m1, 2, 2])) * 2.0
        quats[m1, 0] = (r_mat[m1, 2, 1] - r_mat[m1, 1, 2]) / s
        quats[m1, 1] = 0.25 * s
        quats[m1, 2] = (r_mat[m1, 0, 1] + r_mat[m1, 1, 0]) / s
        quats[m1, 3] = (r_mat[m1, 0, 2] + r_mat[m1, 2, 0]) / s

    m2 = (~m0) & (~m1) & (r_mat[:, 1, 1] > r_mat[:, 2, 2])
    if np.any(m2):
        s = np.sqrt(np.maximum(1e-8, 1.0 + r_mat[m2, 1, 1] - r_mat[m2, 0, 0] - r_mat[m2, 2, 2])) * 2.0
        quats[m2, 0] = (r_mat[m2, 0, 2] - r_mat[m2, 2, 0]) / s
        quats[m2, 1] = (r_mat[m2, 0, 1] + r_mat[m2, 1, 0]) / s
        quats[m2, 2] = 0.25 * s
        quats[m2, 3] = (r_mat[m2, 1, 2] + r_mat[m2, 2, 1]) / s

    m3 = (~m0) & (~m1) & (~m2)
    if np.any(m3):
        s = np.sqrt(np.maximum(1e-8, 1.0 + r_mat[m3, 2, 2] - r_mat[m3, 0, 0] - r_mat[m3, 1, 1])) * 2.0
        quats[m3, 0] = (r_mat[m3, 1, 0] - r_mat[m3, 0, 1]) / s
        quats[m3, 1] = (r_mat[m3, 0, 2] + r_mat[m3, 2, 0]) / s
        quats[m3, 2] = (r_mat[m3, 1, 2] + r_mat[m3, 2, 1]) / s
        quats[m3, 3] = 0.25 * s

    norms = np.linalg.norm(quats, axis=1, keepdims=True)
    norms[norms < 1e-8] = 1.0
    return (quats / norms).astype(np.float32)


def normals_to_quaternions(normals: np.ndarray) -> np.ndarray:
    """단위 법선 벡터 [N, 3]에 대해 로컬 +Z를 법선에 정렬하는 회전 쿼터니언을 생성합니다."""
    n_vec = np.asarray(normals, dtype=np.float32)
    n_norm = np.linalg.norm(n_vec, axis=1, keepdims=True)
    n_norm[n_norm < 1e-8] = 1.0
    n_vec = n_vec / n_norm

    # 기준 상향 벡터(up)와 외적해 직교 접선 기저 (t_u, t_v) 구성
    up = np.zeros_like(n_vec)
    use_x = np.abs(n_vec[:, 1]) > 0.92
    up[use_x, 0] = 1.0
    up[~use_x, 1] = 1.0

    t_u = np.cross(up, n_vec)
    tu_norm = np.linalg.norm(t_u, axis=1, keepdims=True)
    tu_norm[tu_norm < 1e-8] = 1.0
    t_u = t_u / tu_norm

    t_v = np.cross(n_vec, t_u)
    tv_norm = np.linalg.norm(t_v, axis=1, keepdims=True)
    tv_norm[tv_norm < 1e-8] = 1.0
    t_v = t_v / tv_norm

    return basis_to_quaternions(t_u, t_v, n_vec)


def compute_grid_surfels(
    pts_grid: np.ndarray,
    cam_origin: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    2D 이미지 그리드 (sh, sw, 3)에서 복원된 3D 점들로부터
    이웃 픽셀 간 중앙 차분(t_u, t_v)과 외적 법선(n = t_u × t_v)을 구해
    2DGS용 납작한 Surfel 스케일 [N, 3]과 회전 쿼터니언 [N, 4]를 계산합니다.
    """
    du = np.empty_like(pts_grid)
    dv = np.empty_like(pts_grid)

    du[:, 1:-1, :] = (pts_grid[:, 2:, :] - pts_grid[:, :-2, :]) * 0.5
    du[:, 0, :] = pts_grid[:, 1, :] - pts_grid[:, 0, :]
    du[:, -1, :] = pts_grid[:, -1, :] - pts_grid[:, -2, :]

    dv[1:-1, :, :] = (pts_grid[2:, :, :] - pts_grid[:-2, :, :]) * 0.5
    dv[0, :, :] = pts_grid[1, :, :] - pts_grid[0, :, :]
    dv[-1, :, :] = pts_grid[-1, :, :] - pts_grid[-2, :, :]

    pts_flat = pts_grid.reshape(-1, 3).astype(np.float32)
    du_flat = du.reshape(-1, 3).astype(np.float32)
    dv_flat = dv.reshape(-1, 3).astype(np.float32)

    len_u = np.linalg.norm(du_flat, axis=1)
    len_v = np.linalg.norm(dv_flat, axis=1)

    # 깊이 불연속 경계(인접 픽셀이 0.35m 이상 떨어진 곳)에서는 스케일 과팽창 방지
    su = np.clip(len_u * 0.72, 0.015, 0.068)
    sv = np.clip(len_v * 0.72, 0.015, 0.068)
    sz = np.full_like(su, 0.003)  # 2DGS 평면 두께 (거의 0에 가깝게 납작화)
    scales = np.stack([su, sv, sz], axis=-1).astype(np.float32)

    normals = np.cross(du_flat, dv_flat)
    n_len = np.linalg.norm(normals, axis=1, keepdims=True)
    bad_n = (n_len[:, 0] < 1e-6)
    if np.any(bad_n):
        # 외적이 0에 가까우면 카메라 방향을 법선으로 대체
        fallback = np.asarray(cam_origin, dtype=np.float32) - pts_flat[bad_n]
        normals[bad_n] = fallback
        n_len = np.linalg.norm(normals, axis=1, keepdims=True)

    n_len[n_len < 1e-8] = 1.0
    normals = normals / n_len

    # 실내 카메라 원점을 향하도록 법선 방향 통일
    to_cam = np.asarray(cam_origin, dtype=np.float32) - pts_flat
    flip = np.sum(normals * to_cam, axis=1) < 0
    normals[flip] = -normals[flip]

    # 직교 접선 기저 재정렬 (Gram-Schmidt)
    t_u = du_flat.copy()
    t_u -= np.sum(t_u * normals, axis=1, keepdims=True) * normals
    tu_len = np.linalg.norm(t_u, axis=1, keepdims=True)
    zero_tu = tu_len[:, 0] < 1e-6
    if np.any(zero_tu):
        alt = np.tile(np.array([1.0, 0.0, 0.0], dtype=np.float32), (int(np.sum(zero_tu)), 1))
        alt[np.abs(normals[zero_tu, 0]) > 0.9] = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        t_u[zero_tu] = np.cross(alt, normals[zero_tu])
        tu_len = np.linalg.norm(t_u, axis=1, keepdims=True)
    tu_len[tu_len < 1e-8] = 1.0
    t_u = t_u / tu_len

    t_v = np.cross(normals, t_u)
    tv_len = np.linalg.norm(t_v, axis=1, keepdims=True)
    tv_len[tv_len < 1e-8] = 1.0
    t_v = t_v / tv_len

    quats = basis_to_quaternions(t_u, t_v, normals)
    return scales, quats, normals


def estimate_surfel_orientations_pca(
    positions: np.ndarray,
    cell_size: float = 0.16,
    cam_origin: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> tuple[np.ndarray, np.ndarray]:
    """
    COLMAP / DUSt3R처럼 비정렬된 3D 점군(N, 3)에 대해
    Voxel 공간 분할 + 로컬 공분산 PCA(최소 고유값의 고유벡터 = 표면 법선)로
    각 점의 2D Surfel 회전 쿼터니언과 스케일을 추정합니다.
    """
    n_pts = len(positions)
    if n_pts == 0:
        return np.zeros((0, 3), dtype=np.float32), np.zeros((0, 4), dtype=np.float32)

    coords = np.floor(positions / cell_size).astype(np.int32)
    buckets: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for idx, c in enumerate(coords):
        buckets[(int(c[0]), int(c[1]), int(c[2]))].append(idx)

    normals = np.zeros((n_pts, 3), dtype=np.float32)
    origin = np.asarray(cam_origin, dtype=np.float32)

    for key, idxs in buckets.items():
        # 인접 3x3x3 보셀까지 수집하면 얇은 단면에서도 충분한 공분산 샘플 확보
        nbrs = []
        kx, ky, kz = key
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    found = buckets.get((kx + dx, ky + dy, kz + dz))
                    if found:
                        nbrs.extend(found)
        if len(nbrs) >= 4:
            sub = positions[nbrs]
            centered = sub - np.mean(sub, axis=0, keepdims=True)
            cov = (centered.T @ centered) / max(1, len(sub))
            _, eigvecs = np.linalg.eigh(cov)
            normal = eigvecs[:, 0].astype(np.float32)
        else:
            normal = origin - positions[idxs[0]]
            norm_val = float(np.linalg.norm(normal))
            normal = normal / norm_val if norm_val > 1e-6 else np.array([0.0, 0.0, 1.0], dtype=np.float32)

        # 방 내부 중심을 바라보도록 방향 정렬
        center_vec = origin - np.mean(positions[idxs], axis=0)
        if float(np.dot(normal, center_vec)) < 0:
            normal = -normal
        normals[idxs] = normal

    quats = normals_to_quaternions(normals)
    scales = np.tile(np.array([0.032, 0.032, 0.004], dtype=np.float32), (n_pts, 1))
    return scales, quats

