import gzip
import struct
from pathlib import Path
import numpy as np

SH_C0 = 0.28209479177387814
SPZ_MAGIC = 0x5053474E  # "NGSP" little-endian


def write_splat_file(
    output_path: Path,
    positions: np.ndarray,
    scales: np.ndarray,
    colors_rgba: np.ndarray,
    quats: np.ndarray | None = None,
) -> int:
    """
    표준 32-byte .splat 포맷으로 저장합니다.
    - position: float32 x 3 (12 bytes)
    - scale: float32 x 3 (12 bytes)
    - color: uint8 x 4 (RGBA, 4 bytes)
    - rotation: uint8 x 4 (quat wxyz mapped to 0..255, 4 bytes)
    """
    n = len(positions)
    if n == 0:
        raise ValueError("No points to write to .splat file")

    positions = np.asarray(positions, dtype=np.float32).reshape(n, 3)
    scales = np.asarray(scales, dtype=np.float32).reshape(n, 3)
    colors_rgba = np.clip(np.asarray(colors_rgba), 0, 255).astype(np.uint8).reshape(n, 4)

    if quats is None:
        quats_u8 = np.zeros((n, 4), dtype=np.uint8)
        quats_u8[:, 0] = 255  # w = 1.0 -> (1.0 * 128 + 128) clipped to 255
        quats_u8[:, 1:] = 128  # x, y, z = 0.0 -> 128
    else:
        quats = np.asarray(quats, dtype=np.float32).reshape(n, 4)
        norms = np.linalg.norm(quats, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        quats = quats / norms
        quats_u8 = np.clip(np.round(quats * 128.0 + 128.0), 0, 255).astype(np.uint8)

    # 중요도(크기 * 불투명도) 순으로 정렬하면 웹 뷰어 로딩 품질이 향상됨
    importance = np.prod(scales, axis=1) * (colors_rgba[:, 3].astype(np.float32) / 255.0)
    order = np.argsort(-importance)

    positions = positions[order]
    scales = scales[order]
    colors_rgba = colors_rgba[order]
    quats_u8 = quats_u8[order]

    dtype = np.dtype(
        [
            ("pos", "<f4", (3,)),
            ("scale", "<f4", (3,)),
            ("color", "u1", (4,)),
            ("rot", "u1", (4,)),
        ]
    )
    buffer = np.empty(n, dtype=dtype)
    buffer["pos"] = positions
    buffer["scale"] = scales
    buffer["color"] = colors_rgba
    buffer["rot"] = quats_u8

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(buffer.tobytes())

    return n


def write_spz_file(
    output_path: Path,
    positions: np.ndarray,
    scales: np.ndarray,
    colors_rgba: np.ndarray,
    quats: np.ndarray | None = None,
    fractional_bits: int = 12,
) -> int:
    """
    Niantic/Scaniverse SPZ v2 gzip 포맷으로 75~88% 압축 저장합니다.
    (@sparkjsdev/spark 뷰어 및 Three.js WebAssembly 로더와 100% 호환)
    """
    n = len(positions)
    if n == 0:
        raise ValueError("No points to write to .spz file")

    pos = np.asarray(positions, dtype=np.float32).reshape(n, 3)
    sc = np.clip(np.asarray(scales, dtype=np.float32).reshape(n, 3), 1e-6, 100.0)
    rgba = np.clip(np.asarray(colors_rgba), 0, 255).astype(np.uint8).reshape(n, 4)

    if quats is None:
        q_wxyz = np.zeros((n, 4), dtype=np.float32)
        q_wxyz[:, 0] = 1.0
    else:
        q_wxyz = np.asarray(quats, dtype=np.float32).reshape(n, 4)
        norms = np.linalg.norm(q_wxyz, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        q_wxyz = q_wxyz / norms
    # SPZ v2는 w >= 0 인 정규화 쿼터니언의 (x, y, z)만 8-bit로 저장
    flip = q_wxyz[:, 0] < 0
    if np.any(flip):
        q_wxyz = q_wxyz.copy()
        q_wxyz[flip] = -q_wxyz[flip]

    scale_factor = float(1 << fractional_bits)
    pos_q = np.clip(np.rint(pos * scale_factor), -8388608, 8388607).astype("<i4")
    pos_bytes = pos_q.view(np.uint8).reshape(n, 3, 4)[:, :, :3].tobytes()

    alphas_bytes = rgba[:, 3].tobytes()

    rgb_float = rgba[:, :3].astype(np.float32) / 255.0
    col_u8 = np.clip(np.rint(((rgb_float - 0.5) / SH_C0 * 0.15 + 0.5) * 255.0), 0, 255).astype(np.uint8)
    colors_bytes = col_u8.tobytes()

    sc_u8 = np.clip(np.rint((np.log(sc) + 10.0) * 16.0), 0, 255).astype(np.uint8)
    scales_bytes = sc_u8.tobytes()

    rot_u8 = np.clip(np.rint(q_wxyz[:, 1:4] * 127.5 + 127.5), 0, 255).astype(np.uint8)
    rot_bytes = rot_u8.tobytes()

    header = struct.pack("<IIIBBBB", SPZ_MAGIC, 2, n, 0, fractional_bits, 0, 0)
    raw = header + pos_bytes + alphas_bytes + colors_bytes + scales_bytes + rot_bytes

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(gzip.compress(raw, compresslevel=6))
    return n


def convert_splat_to_spz(splat_path: Path, spz_path: Path) -> int:
    """기존 32-byte .splat 파일을 읽어 압축 .spz v2 파일로 변환합니다."""
    dtype = np.dtype(
        [
            ("pos", "<f4", (3,)),
            ("scale", "<f4", (3,)),
            ("color", "u1", (4,)),
            ("rot", "u1", (4,)),
        ]
    )
    data = np.fromfile(splat_path, dtype=dtype)
    if len(data) == 0:
        raise ValueError(f"Empty .splat file: {splat_path}")
    quats = (data["rot"].astype(np.float32) - 128.0) / 128.0
    return write_spz_file(spz_path, data["pos"], data["scale"], data["color"], quats=quats)


def write_ply_file(
    output_path: Path,
    positions: np.ndarray,
    colors_rgb: np.ndarray,
) -> int:
    """표준 바이너리 .ply 파일로도 함께 저장합니다."""
    n = len(positions)
    positions = np.asarray(positions, dtype=np.float32).reshape(n, 3)
    colors_rgb = np.clip(np.asarray(colors_rgb)[:, :3], 0, 255).astype(np.uint8).reshape(n, 3)

    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "end_header\n"
    ).encode("ascii")

    dtype = np.dtype([("pos", "<f4", (3,)), ("color", "u1", (3,))])
    data = np.empty(n, dtype=dtype)
    data["pos"] = positions
    data["color"] = colors_rgb

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(header)
        f.write(data.tobytes())

    return n


def convert_ply_to_splat(ply_path: Path, splat_path: Path) -> int:
    """
    OpenSplat / Gaussian Splatting .ply 파일 또는 일반 포인트클라우드 .ply 파일을 읽어
    표준 32-byte .splat 파일로 변환합니다.
    """
    with open(ply_path, "rb") as f:
        header_lines = []
        while True:
            line = f.readline().decode("utf-8", errors="ignore").strip()
            header_lines.append(line)
            if line == "end_header":
                break
        body = f.read()

    vertex_count = 0
    properties = []
    is_binary = True
    for line in header_lines:
        if line.startswith("format "):
            is_binary = "binary_little_endian" in line
        elif line.startswith("element vertex "):
            vertex_count = int(line.split()[-1])
        elif line.startswith("property "):
            parts = line.split()
            prop_type, prop_name = parts[1], parts[2]
            properties.append((prop_name, prop_type))

    if vertex_count == 0:
        raise ValueError(f"Empty PLY file: {ply_path}")

    type_map = {
        "float": "<f4",
        "float32": "<f4",
        "double": "<f8",
        "uchar": "u1",
        "uint8": "u1",
        "int": "<i4",
        "short": "<i2",
        "ushort": "<u2",
    }

    if is_binary:
        np_fields = [(name, type_map.get(ptype, "<f4")) for name, ptype in properties]
        dtype = np.dtype(np_fields)
        vertices = np.frombuffer(body, dtype=dtype, count=vertex_count)
    else:
        lines = body.decode("utf-8", errors="ignore").strip().splitlines()[:vertex_count]
        raw = np.array([[float(x) for x in ln.split()] for ln in lines], dtype=np.float32)
        np_fields = [(name, "<f4") for name, _ in properties]
        dtype = np.dtype(np_fields)
        vertices = np.empty(len(raw), dtype=dtype)
        for idx, (name, _) in enumerate(properties):
            vertices[name] = raw[:, idx]
        vertex_count = len(raw)

    prop_names = {name for name, _ in properties}
    positions = np.stack([vertices["x"], vertices["y"], vertices["z"]], axis=-1).astype(np.float32)

    # 스케일 추출 (OpenSplat / 3DGS는 로그 스케일로 저장함)
    if {"scale_0", "scale_1", "scale_2"}.issubset(prop_names):
        scales = np.exp(
            np.stack([vertices["scale_0"], vertices["scale_1"], vertices["scale_2"]], axis=-1).astype(np.float32)
        )
        scales = np.clip(scales, 0.001, 0.5)
    else:
        scales = np.full((vertex_count, 3), 0.02, dtype=np.float32)

    # 색상 및 투명도 추출 (3DGS Spherical Harmonics f_dc_0..2 또는 red/green/blue)
    if {"f_dc_0", "f_dc_1", "f_dc_2"}.issubset(prop_names):
        r = np.clip((0.5 + SH_C0 * vertices["f_dc_0"]) * 255.0, 0, 255)
        g = np.clip((0.5 + SH_C0 * vertices["f_dc_1"]) * 255.0, 0, 255)
        b = np.clip((0.5 + SH_C0 * vertices["f_dc_2"]) * 255.0, 0, 255)
    elif {"red", "green", "blue"}.issubset(prop_names):
        r = vertices["red"]
        g = vertices["green"]
        b = vertices["blue"]
    else:
        r = np.full(vertex_count, 200.0)
        g = np.full(vertex_count, 200.0)
        b = np.full(vertex_count, 200.0)

    if "opacity" in prop_names:
        op = vertices["opacity"].astype(np.float32)
        alpha = (1.0 / (1.0 + np.exp(-np.clip(op, -20.0, 20.0)))) * 255.0
    else:
        alpha = np.full(vertex_count, 245.0)

    colors_rgba = np.stack([r, g, b, alpha], axis=-1).astype(np.uint8)

    # 회전 쿼터니언 추출
    if {"rot_0", "rot_1", "rot_2", "rot_3"}.issubset(prop_names):
        quats = np.stack(
            [vertices["rot_0"], vertices["rot_1"], vertices["rot_2"], vertices["rot_3"]],
            axis=-1,
        ).astype(np.float32)
    else:
        quats = None

    return write_splat_file(splat_path, positions, scales, colors_rgba, quats)


def read_colmap_points3d_bin(bin_path: Path) -> tuple[np.ndarray, np.ndarray]:
    """COLMAP points3D.bin 파일을 읽어 (positions, colors_rgb)를 반환합니다."""
    positions = []
    colors = []
    with open(bin_path, "rb") as f:
        num_points = struct.unpack("<Q", f.read(8))[0]
        for _ in range(num_points):
            data = f.read(43)
            if len(data) < 43:
                break
            # point3D_id (Q:8), xyz (ddd:24), rgb (BBB:3), error (d:8) = 43 bytes
            _, x, y, z, r, g, b, _ = struct.unpack("<QdddBBBd", data)
            track_len = struct.unpack("<Q", f.read(8))[0]
            f.read(track_len * 8)  # image_id (i:4) + point2D_idx (i:4)
            positions.append((x, -y, -z))  # COLMAP 좌표계를 WebGL Y-up 좌표계로 정렬
            colors.append((r, g, b))

    if not positions:
        return np.zeros((0, 3), dtype=np.float32), np.zeros((0, 3), dtype=np.uint8)

    pos_arr = np.array(positions, dtype=np.float32)
    col_arr = np.array(colors, dtype=np.uint8)

    # 이상치(outlier) 제거 (상하위 2% 클리핑)
    low, high = np.percentile(pos_arr, [2, 98], axis=0)
    mask = np.all((pos_arr >= low) & (pos_arr <= high), axis=1)
    pos_arr = pos_arr[mask]
    col_arr = col_arr[mask]

    # 중심 정렬 및 스케일 정규화 (방 크기가 약 6m 내외가 되도록 조정)
    center = np.median(pos_arr, axis=0)
    pos_arr = pos_arr - center
    span = np.percentile(np.abs(pos_arr), 95)
    if span > 1e-5:
        pos_arr = pos_arr * (3.2 / span)

    return pos_arr, col_arr

