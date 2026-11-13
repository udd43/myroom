"""
DUSt3R / MASt3R (Naver Labs) 연동 모듈.
COLMAP의 느린 SIFT 매칭 대신, 추출된 실내 영상 키프레임 쌍(Pair)으로부터
밀집 3D 포인트맵(Pointmap)과 카메라 포즈를 즉시 복원합니다.
"""

import importlib.util
from pathlib import Path
from typing import Callable
import cv2
import numpy as np


def is_dust3r_available() -> bool:
    return (
        importlib.util.find_spec("dust3r") is not None
        or importlib.util.find_spec("mast3r") is not None
    )


def reconstruct_with_dust3r(
    frame_paths: list[Path],
    workspace_dir: Path,
    on_progress: Callable[[int, str], None] | None = None,
) -> tuple[np.ndarray, np.ndarray] | None:
    """
    1) dust3r / mast3r 패키지가 설치되어 있으면 AsymmetricCroCo3DStereo 모델로
       글로벌 정렬된 3D 포인트 클라우드(positions, colors_rgb)를 추출합니다.
    2) 가중치가 아직 없거나 CPU 전용 경량 모드일 경우, 연속 프레임 간 ORB/SIFT 특징점 +
       Essential Matrix 포즈 복원 및 스테레오 삼각측량(Triangulation)으로
       희소/준밀집 3D 포인트를 생성합니다.
    """
    if len(frame_paths) < 2:
        return None

    if is_dust3r_available():
        try:
            if on_progress:
                on_progress(32, "DUSt3R/MASt3R 신경망으로 프레임 간 3D 포인트맵 추론 중...")
            import torch  # type: ignore
            from dust3r.inference import inference  # type: ignore
            from dust3r.model import AsymmetricCroCo3DStereo  # type: ignore
            from dust3r.utils.image import load_images  # type: ignore
            from dust3r.image_pairs import make_pairs  # type: ignore
            from dust3r.cloud_opt import global_aligner, GlobalAlignerMode  # type: ignore

            device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
            model = AsymmetricCroCo3DStereo.from_pretrained("naver/DUSt3R_ViTLarge_BaseDecoder_512_dpt").to(device)
            imgs = load_images([str(p) for p in frame_paths[:16]], size=512)
            pairs = make_pairs(imgs, scene_graph="swin-2", prefilter=None, symmetrize=True)
            output = inference(pairs, model, device, batch_size=1)
            scene = global_aligner(output, device=device, mode=GlobalAlignerMode.PointCloudOptimizer)
            scene.compute_global_alignment(init="mst", niter=150, schedule="cosine", lr=0.01)

            pts_list = [p.detach().cpu().numpy().reshape(-1, 3) for p in scene.get_pts3d()]
            col_list = [(c.reshape(-1, 3) * 255).astype(np.uint8) for c in scene.imgs]
            pts = np.concatenate(pts_list, axis=0).astype(np.float32)
            cols = np.concatenate(col_list, axis=0)
            return pts, cols
        except Exception:
            pass

    # Multi-view Essential Matrix + Triangulation (Lightweight Stereo SfM)
    if on_progress:
        on_progress(34, "멀티뷰 스테레오 삼각측량(Triangulation)으로 3D 구조점 추출 중...")

    orb = cv2.ORB_create(nfeatures=1500)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    all_pts: list[np.ndarray] = []
    all_cols: list[np.ndarray] = []

    r_total = np.eye(3, dtype=np.float64)
    t_total = np.zeros((3, 1), dtype=np.float64)

    sample_paths = frame_paths[:: max(1, len(frame_paths) // 16)]
    for i in range(len(sample_paths) - 1):
        img1 = cv2.imread(str(sample_paths[i]))
        img2 = cv2.imread(str(sample_paths[i + 1]))
        if img1 is None or img2 is None:
            continue

        h, w = img1.shape[:2]
        focal = 0.85 * max(w, h)
        k_mat = np.array([[focal, 0, w / 2.0], [0, focal, h / 2.0], [0, 0, 1.0]], dtype=np.float64)

        g1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        g2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        kp1, des1 = orb.detectAndCompute(g1, None)
        kp2, des2 = orb.detectAndCompute(g2, None)
        if des1 is None or des2 is None or len(kp1) < 16 or len(kp2) < 16:
            continue

        matches = bf.match(des1, des2)
        if len(matches) < 16:
            continue

        pts1 = np.float32([kp1[m.queryIdx].pt for m in matches])
        pts2 = np.float32([kp2[m.trainIdx].pt for m in matches])

        e_mat, mask = cv2.findEssentialMat(pts1, pts2, k_mat, method=cv2.RANSAC, prob=0.999, threshold=1.5)
        if e_mat is None or e_mat.shape != (3, 3):
            continue

        _, r_rel, t_rel, mask_pose = cv2.recoverPose(e_mat, pts1, pts2, k_mat, mask=mask)
        p1 = k_mat @ np.hstack((r_total, t_total))
        r_next = r_rel @ r_total
        t_next = r_rel @ t_total + t_rel
        p2 = k_mat @ np.hstack((r_next, t_next))

        pts4d = cv2.triangulatePoints(p1, p2, pts1.T, pts2.T)
        w_coord = pts4d[3:]
        valid = np.abs(w_coord.ravel()) > 1e-4
        if not np.any(valid):
            continue

        pts3d = (pts4d[:3, valid] / w_coord[:, valid]).T.astype(np.float32)
        norms = np.linalg.norm(pts3d, axis=1)
        keep = (norms > 0.2) & (norms < 15.0)
        pts3d = pts3d[keep]
        if len(pts3d) == 0:
            continue

        rgb1 = cv2.cvtColor(img1, cv2.COLOR_BGR2RGB)
        uv = np.clip(pts1[valid][keep].astype(int), [0, 0], [w - 1, h - 1])
        cols = rgb1[uv[:, 1], uv[:, 0]]

        all_pts.append(pts3d)
        all_cols.append(cols)
        r_total, t_total = r_next, t_next

    if not all_pts:
        return None

    pos_arr = np.concatenate(all_pts, axis=0)
    col_arr = np.concatenate(all_cols, axis=0)

    center = np.median(pos_arr, axis=0)
    pos_arr = pos_arr - center
    span = float(np.percentile(np.abs(pos_arr), 92))
    if span > 1e-4:
        pos_arr = pos_arr * (2.6 / span)

    return pos_arr.astype(np.float32), col_arr.astype(np.uint8)

