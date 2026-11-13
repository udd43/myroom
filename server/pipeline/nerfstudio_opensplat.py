"""
OpenSplat 및 Nerfstudio (splatfacto) 3D Gaussian Splatting 학습 엔진 연동 모듈.
Apple Silicon (Metal/MPS) 또는 Linux CUDA/CPU 환경에서 COLMAP/DUSt3R 결과를 입력받아
고품질 .ply 및 .splat 파일을 생성합니다.
"""

import shutil
import subprocess
from pathlib import Path
from typing import Callable

from .splat_converter import convert_ply_to_splat


def find_opensplat_binary() -> str | None:
    local_bin = Path(__file__).resolve().parent.parent / "bin" / "opensplat"
    if local_bin.exists():
        return str(local_bin)
    return shutil.which("opensplat") or (
        "/usr/local/bin/opensplat" if Path("/usr/local/bin/opensplat").exists() else None
    )


def find_nerfstudio_binaries() -> tuple[str | None, str | None]:
    return shutil.which("ns-train"), shutil.which("ns-export")


def train_gaussian_splats(
    workspace_dir: Path,
    output_ply_path: Path,
    output_splat_path: Path,
    quality: str = "high",
    on_progress: Callable[[int, str], None] | None = None,
) -> tuple[int, str] | None:
    """
    1순위: OpenSplat 바이너리로 학습
    2순위: Nerfstudio (ns-train splatfacto + ns-export gaussian-splat)로 학습
    성공 시 (splat_count, engine_name) 반환
    """
    opensplat_bin = find_opensplat_binary()
    if opensplat_bin:
        if on_progress:
            on_progress(72, "OpenSplat 엔진으로 3D Gaussian Splatting 학습 중...")
        num_iters = "2500" if quality == "high" else "1000"
        tmp_ply = workspace_dir / "opensplat_out.ply"
        subprocess.run(
            [opensplat_bin, str(workspace_dir), "-n", num_iters, "-o", str(tmp_ply)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=900,
        )
        if tmp_ply.exists():
            shutil.copy(tmp_ply, output_ply_path)
            cnt = convert_ply_to_splat(tmp_ply, output_splat_path)
            return cnt, "colmap_opensplat_3dgs"

    ns_train, ns_export = find_nerfstudio_binaries()
    if ns_train and ns_export:
        if on_progress:
            on_progress(72, "Nerfstudio (splatfacto) 엔진으로 3D Gaussian Splatting 학습 중...")
        ns_out = workspace_dir / "ns_outputs"
        max_iters = "3000" if quality == "high" else "1200"
        subprocess.run(
            [
                ns_train,
                "splatfacto",
                "--data",
                str(workspace_dir),
                "--output-dir",
                str(ns_out),
                "--max-num-iterations",
                max_iters,
                "--viewer.quit-on-train-completion",
                "True",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=1200,
        )
        configs = list(ns_out.rglob("config.yml"))
        if configs:
            export_dir = workspace_dir / "ns_export"
            subprocess.run(
                [
                    ns_export,
                    "gaussian-splat",
                    "--load-config",
                    str(configs[0]),
                    "--output-dir",
                    str(export_dir),
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=300,
            )
            exported_ply = export_dir / "splat.ply"
            if exported_ply.exists():
                shutil.copy(exported_ply, output_ply_path)
                cnt = convert_ply_to_splat(exported_ply, output_splat_path)
                return cnt, "nerfstudio_splatfacto"

    return None

