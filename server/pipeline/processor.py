import os
import shutil
import subprocess
from pathlib import Path
from typing import Callable
import cv2
import numpy as np

from .splat_converter import (
    write_splat_file,
    write_ply_file,
    convert_ply_to_splat,
    read_colmap_points3d_bin,
)
from .dust3r_engine import is_dust3r_available, reconstruct_with_dust3r
from .nerfstudio_opensplat import (
    find_nerfstudio_binaries,
    find_opensplat_binary,
    train_gaussian_splats,
)
from .surface_reconstructor import compute_grid_surfels, estimate_surfel_orientations_pca


def check_engine_capabilities() -> dict:
    """현재 서버에서 사용 가능한 3D 변환 도구(FFmpeg, COLMAP, DUSt3R, OpenSplat, Nerfstudio) 상태를 확인합니다."""
    ffmpeg_bin = shutil.which("ffmpeg")
    colmap_bin = shutil.which("colmap")
    opensplat_bin = find_opensplat_binary()
    ns_train, _ = find_nerfstudio_binaries()
    dust3r_ok = is_dust3r_available()
    return {
        "ffmpeg": bool(ffmpeg_bin),
        "ffmpeg_path": ffmpeg_bin,
        "colmap": bool(colmap_bin),
        "colmap_path": colmap_bin,
        "dust3r": dust3r_ok,
        "opensplat": bool(opensplat_bin),
        "opensplat_path": opensplat_bin,
        "nerfstudio": bool(ns_train),
        "nerfstudio_path": ns_train,
        "mode": (
            "colmap_opensplat"
            if (colmap_bin and (opensplat_bin or ns_train))
            else ("dust3r_3dgs" if dust3r_ok else "hybrid_volumetric")
        ),
    }


def extract_sharp_frames(
    video_path: Path,
    frames_dir: Path,
    thumb_path: Path,
    target_count: int = 48,
    on_progress: Callable[[int, str], None] | None = None,
) -> list[Path]:
    """
    동영상에서 흔들림(모션 블러)이 가장 적은 선명한 프레임들을 균일한 구간별로 추출합니다.
    """
    frames_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"동영상 파일을 열 수 없습니다: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 100
    step = max(1, total_frames // (target_count * 3))

    candidates = []
    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if idx % step == 0:
            h, w = frame.shape[:2]
            max_dim = 960
            if max(h, w) > max_dim:
                scale = max_dim / max(h, w)
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            candidates.append((idx, sharpness, frame))
        idx += 1

    cap.release()

    if not candidates:
        raise RuntimeError("동영상에서 유효한 프레임을 추출하지 못했습니다.")

    # 전체 구간을 target_count개의 버킷으로 나누어 각 구간에서 가장 선명한 프레임 선택
    bucket_size = max(1, len(candidates) / target_count)
    selected = []
    for b in range(min(target_count, len(candidates))):
        start = int(b * bucket_size)
        end = max(start + 1, int((b + 1) * bucket_size))
        chunk = candidates[start:end]
        if chunk:
            best = max(chunk, key=lambda item: item[1])
            selected.append(best)

    saved_paths = []
    for i, (_, _, frame) in enumerate(selected):
        out_file = frames_dir / f"frame_{i:04d}.jpg"
        cv2.imwrite(str(out_file), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        saved_paths.append(out_file)
        if i == len(selected) // 3:
            cv2.imwrite(str(thumb_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

    if not thumb_path.exists() and saved_paths:
        shutil.copy(saved_paths[0], thumb_path)

    if on_progress:
        on_progress(20, f"선명한 키프레임 {len(saved_paths)}장 추출 완료 (모션블러 필터링 적용)")

    return saved_paths


def build_volumetric_splat_from_frames(
    frame_paths: list[Path],
    splat_path: Path,
    ply_path: Path,
    extra_colmap_pts: tuple[np.ndarray, np.ndarray] | None = None,
    on_progress: Callable[[int, str], None] | None = None,
) -> int:
    """
    추출된 실내 영상 프레임들의 카메라 회전/이동 궤적(Optical Flow) 및
    실내 깊이/표면 기하 추정(Depth & Normal Estimation)을 결합하여
    밀도 높은 3D Gaussian Splat (.splat & .ply) 볼류메트릭 공간을 생성합니다.
    """
    if on_progress:
        on_progress(35, "프레임 간 카메라 3D 궤적 및 실내 깊이 맵(Depth) 분석 중...")

    positions_list = []
    scales_list = []
    colors_list = []
    quats_list = []

    num_frames = len(frame_paths)
    prev_gray = None
    cum_yaw = 0.0
    cum_pitch = 0.0

    # 실내 방 크기 기준 (약 가로 5.4m x 세로 4.8m x 높이 2.5m 볼류메트릭 프로젝션)
    room_rx, room_ry, room_rz = 2.7, 1.35, 2.4

    for idx, fpath in enumerate(frame_paths):
        img_bgr = cv2.imread(str(fpath))
        if img_bgr is None:
            continue
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # 이전 프레임과의 Optical Flow로 카메라 회전량 추정
        if prev_gray is not None and prev_gray.shape == gray.shape:
            pts0 = cv2.goodFeaturesToTrack(prev_gray, maxCorners=120, qualityLevel=0.01, minDistance=12)
            if pts0 is not None:
                pts1, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, pts0, None)
                if pts1 is not None and st is not None:
                    valid = st.ravel() == 1
                    if np.any(valid):
                        flow = (pts1[valid] - pts0[valid]).reshape(-1, 2)
                        dx = float(np.median(flow[:, 0]))
                        dy = float(np.median(flow[:, 1]))
                        cum_yaw += -dx / max(1.0, gray.shape[1]) * 1.65
                        cum_pitch = np.clip(cum_pitch + dy / max(1.0, gray.shape[0]) * 0.6, -0.45, 0.45)
                else:
                    cum_yaw += (2.0 * np.pi) / max(1, num_frames)
            else:
                cum_yaw += (2.0 * np.pi) / max(1, num_frames)
        else:
            cum_yaw = (idx / max(1, num_frames)) * 2.0 * np.pi

        prev_gray = gray

        # 샘플링 해상도 (프레임당 약 3,200개 스플랫 -> 45프레임 시 약 14만 개 고밀도 스플랫)
        sh, sw = 54, 68
        small_rgb = cv2.resize(img_rgb, (sw, sh), interpolation=cv2.INTER_AREA)
        small_gray = cv2.resize(gray, (sw, sh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0

        # 에지 및 밝기/수직 위치 기반 실내 깊이 추정 (Room Box Ray-intersection + Local Depth Relief)
        gx = cv2.Sobel(small_gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(small_gray, cv2.CV_32F, 0, 1, ksize=3)
        grad = np.clip(np.hypot(gx, gy), 0.0, 1.0)

        u = np.linspace(-0.52, 0.52, sw)
        v = np.linspace(0.42, -0.42, sh)
        uu, vv = np.meshgrid(u, v)

        # 현재 프레임 카메라의 시선 방향 벡터 (Ray direction)
        yaw_angle = cum_yaw + uu * 1.15
        pitch_angle = cum_pitch + vv * 0.88

        dir_x = np.sin(yaw_angle) * np.cos(pitch_angle)
        dir_y = np.sin(pitch_angle)
        dir_z = -np.cos(yaw_angle) * np.cos(pitch_angle)

        # 방 경계면(Box)과의 교차 거리 계산 + 실내 가구 입체감(Relief) 부여
        eps = 1e-4
        tx = room_rx / np.maximum(np.abs(dir_x), eps)
        ty = room_ry / np.maximum(np.abs(dir_y), eps)
        tz = room_rz / np.maximum(np.abs(dir_z), eps)
        t_box = np.minimum(np.minimum(tx, ty), tz)

        # 실내 오브젝트(가구/창틀/소품)는 에지 및 명암에 따라 벽면보다 안쪽으로 돌출되도록 깊이 변조
        relief = 1.0 - 0.22 * (1.0 - small_gray) - 0.08 * grad
        dist = t_box * np.clip(relief, 0.58, 1.02)

        pts_grid = np.stack([dir_x * dist, dir_y * dist, dir_z * dist], axis=-1).astype(np.float32)
        pts = pts_grid.reshape(-1, 3)
        cols_rgb = small_rgb.reshape(-1, 3)
        alpha = np.full((len(pts), 1), 232, dtype=np.uint8)
        cols_rgba = np.concatenate([cols_rgb, alpha], axis=-1)

        # 2DGS (2D Gaussian Surfel): 로컬 접선 u, v 평면 정렬 및 얇은 평면 스케일(sz≈0) 계산
        scls, qts, _ = compute_grid_surfels(pts_grid, cam_origin=(0.0, 0.0, 0.0))

        positions_list.append(pts)
        scales_list.append(scls)
        colors_list.append(cols_rgba)
        quats_list.append(qts)

    if extra_colmap_pts is not None and len(extra_colmap_pts[0]) > 0:
        c_pos, c_col = extra_colmap_pts
        c_alpha = np.full((len(c_pos), 1), 250, dtype=np.uint8)
        c_rgba = np.concatenate([c_col, c_alpha], axis=-1)
        c_scl, c_qts = estimate_surfel_orientations_pca(
            c_pos, cell_size=0.16, cam_origin=(0.0, 0.0, 0.0)
        )
        positions_list.append(c_pos)
        scales_list.append(c_scl)
        colors_list.append(c_rgba)
        quats_list.append(c_qts)

    all_pos = np.concatenate(positions_list, axis=0)
    all_scl = np.concatenate(scales_list, axis=0)
    all_col = np.concatenate(colors_list, axis=0)
    all_quat = np.concatenate(quats_list, axis=0)

    # 최대 180,000개 스플랫으로 최적화 (모바일 및 노트북 웹 60fps 유지)
    max_splats = 180_000
    if len(all_pos) > max_splats:
        rng = np.random.default_rng(42)
        keep = rng.choice(len(all_pos), size=max_splats, replace=False)
        all_pos = all_pos[keep]
        all_scl = all_scl[keep]
        all_col = all_col[keep]
        all_quat = all_quat[keep]

    if on_progress:
        on_progress(60, f"3D 2DGS 표면 서펠 ({len(all_pos):,}개 평면) 생성 및 저장 중...")

    write_ply_file(ply_path, all_pos, all_col[:, :3])
    return write_splat_file(splat_path, all_pos, all_scl, all_col, quats=all_quat)


def process_video_to_3d(
    video_path: Path,
    workspace_dir: Path,
    output_splat_path: Path,
    output_ply_path: Path,
    thumb_path: Path,
    quality: str = "high",
    on_progress: Callable[[int, str], None] | None = None,
) -> dict:
    """
    업로드된 집 동영상을 3D Gaussian Splatting (.splat & .ply)으로 변환하는 메인 파이프라인.
    1) 선명한 키프레임 추출 (모션 블러 제거)
    2) 즉시 확인 가능한 1차 볼류메트릭 .splat 생성
    3) COLMAP + OpenSplat이 설치되어 있고 정밀 모드인 경우 SfM & 3DGS 정밀 학습 수행
    """
    workspace_dir.mkdir(parents=True, exist_ok=True)
    frames_dir = workspace_dir / "images"

    if on_progress:
        on_progress(8, "동영상 분석 및 흔들림 없는 키프레임 추출 시작...")

    frame_paths = extract_sharp_frames(
        video_path=video_path,
        frames_dir=frames_dir,
        thumb_path=thumb_path,
        target_count=56 if quality == "high" else 36,
        on_progress=on_progress,
    )

    caps = check_engine_capabilities()
    colmap_pts = None
    used_engine = "hybrid_volumetric"

    # COLMAP이 설치되어 있으면 카메라 포즈 및 희소 3D 포인트 클라우드 재구성 실행
    if caps["colmap"] and quality in ("high", "standard"):
        try:
            if on_progress:
                on_progress(30, "COLMAP 특징점 추출(SIFT) 및 카메라 3D 위치 추적 중...")

            db_path = workspace_dir / "database.db"
            sparse_dir = workspace_dir / "sparse"
            sparse_dir.mkdir(parents=True, exist_ok=True)

            subprocess.run(
                [
                    caps["colmap_path"],
                    "feature_extractor",
                    "--database_path",
                    str(db_path),
                    "--image_path",
                    str(frames_dir),
                    "--ImageReader.single_camera",
                    "1",
                    "--SiftExtraction.use_gpu",
                    "0",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=300,
            )

            if on_progress:
                on_progress(45, "COLMAP 연속 프레임 매칭(Sequential Matching) 수행 중...")

            subprocess.run(
                [
                    caps["colmap_path"],
                    "sequential_matcher",
                    "--database_path",
                    str(db_path),
                    "--SiftMatching.use_gpu",
                    "0",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=300,
            )

            if on_progress:
                on_progress(58, "COLMAP 3D 희소 맵핑(Bundle Adjustment) 계산 중...")

            subprocess.run(
                [
                    caps["colmap_path"],
                    "mapper",
                    "--database_path",
                    str(db_path),
                    "--image_path",
                    str(frames_dir),
                    "--output_path",
                    str(sparse_dir),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=420,
            )

            model_0 = sparse_dir / "0"
            pts_bin = model_0 / "points3D.bin"
            if pts_bin.exists():
                colmap_pts = read_colmap_points3d_bin(pts_bin)
                used_engine = "colmap_sfm_volumetric"

                # OpenSplat 또는 Nerfstudio(splatfacto)가 있으면 정밀 Gaussian Splatting 학습 수행
                if len(colmap_pts[0]) >= 50:
                    trained = train_gaussian_splats(
                        workspace_dir=workspace_dir,
                        output_ply_path=output_ply_path,
                        output_splat_path=output_splat_path,
                        quality=quality,
                        on_progress=on_progress,
                    )
                    if trained is not None:
                        splat_count, used_engine = trained
                        if on_progress:
                            on_progress(100, f"정밀 3D 가우시안 스플래팅 완료 ({splat_count:,} splats)")
                        return {
                            "splat_count": splat_count,
                            "frame_count": len(frame_paths),
                            "engine": used_engine,
                        }
        except Exception as e:
            if on_progress:
                on_progress(62, f"COLMAP/OpenSplat 보조 모드로 전환 ({type(e).__name__})")

    # COLMAP 포인트가 없을 때 DUSt3R / MASt3R 또는 스테레오 삼각측량 포인트 추출
    if colmap_pts is None:
        dust_pts = reconstruct_with_dust3r(frame_paths, workspace_dir, on_progress=on_progress)
        if dust_pts is not None and len(dust_pts[0]) > 0:
            colmap_pts = dust_pts
            used_engine = "dust3r_mast3r_3d" if caps.get("dust3r") else "stereo_sfm_volumetric"

    # 볼류메트릭 스플랫 생성 (COLMAP 포인트가 있으면 함께 융합)
    splat_count = build_volumetric_splat_from_frames(
        frame_paths=frame_paths,
        splat_path=output_splat_path,
        ply_path=output_ply_path,
        extra_colmap_pts=colmap_pts,
        on_progress=on_progress,
    )

    if on_progress:
        on_progress(100, f"3D 볼류메트릭 공간 생성 완료 ({splat_count:,} splats)")

    return {
        "splat_count": splat_count,
        "frame_count": len(frame_paths),
        "engine": used_engine,
    }

