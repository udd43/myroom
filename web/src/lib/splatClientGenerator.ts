import { ParsedSplatData } from "@/types/room";
import { computeGridSurfels, normalToQuaternion } from "./surfaceMesher";

/**
 * 표준 32-byte .splat 바이너리 버퍼를 파싱합니다.
 * Layout per splat (32 bytes):
 * - float32 x 3: position (x, y, z) [0..11]
 * - float32 x 3: scale (sx, sy, sz) [12..23]
 * - uint8 x 4: color (r, g, b, a) [24..27]
 * - uint8 x 4: quaternion (w, x, y, z) [28..31]
 */
export function parseSplatArrayBuffer(buffer: ArrayBuffer): ParsedSplatData {
  const byteLength = buffer.byteLength;
  const count = Math.floor(byteLength / 32);
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const quats = new Float32Array(count * 4);

  const f32 = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);

  for (let i = 0; i < count; i++) {
    const fOffset = i * 8; // 32 bytes = 8 float32s
    const bOffset = i * 32;

    positions[i * 3 + 0] = f32[fOffset + 0];
    positions[i * 3 + 1] = f32[fOffset + 1];
    positions[i * 3 + 2] = f32[fOffset + 2];

    scales[i * 3 + 0] = f32[fOffset + 3];
    scales[i * 3 + 1] = f32[fOffset + 4];
    scales[i * 3 + 2] = f32[fOffset + 5];

    colors[i * 4 + 0] = u8[bOffset + 24] / 255.0;
    colors[i * 4 + 1] = u8[bOffset + 25] / 255.0;
    colors[i * 4 + 2] = u8[bOffset + 26] / 255.0;
    colors[i * 4 + 3] = u8[bOffset + 27] / 255.0;

    const qw = (u8[bOffset + 28] - 128) / 128.0;
    const qx = (u8[bOffset + 29] - 128) / 128.0;
    const qy = (u8[bOffset + 30] - 128) / 128.0;
    const qz = (u8[bOffset + 31] - 128) / 128.0;
    const qLen = Math.hypot(qw, qx, qy, qz) || 1.0;
    quats[i * 4 + 0] = qw / qLen;
    quats[i * 4 + 1] = qx / qLen;
    quats[i * 4 + 2] = qy / qLen;
    quats[i * 4 + 3] = qz / qLen;
  }

  return { count, positions, scales, colors, quats };
}

export function encodeSplatArrayBuffer(data: ParsedSplatData): ArrayBuffer {
  const { count, positions, scales, colors, quats } = data;
  const buffer = new ArrayBuffer(count * 32);
  const f32 = new Float32Array(buffer);
  const u8 = new Uint8Array(buffer);

  for (let i = 0; i < count; i++) {
    const fOffset = i * 8;
    const bOffset = i * 32;

    f32[fOffset + 0] = positions[i * 3 + 0];
    f32[fOffset + 1] = positions[i * 3 + 1];
    f32[fOffset + 2] = positions[i * 3 + 2];

    f32[fOffset + 3] = scales[i * 3 + 0];
    f32[fOffset + 4] = scales[i * 3 + 1];
    f32[fOffset + 5] = scales[i * 3 + 2];

    u8[bOffset + 24] = Math.min(255, Math.max(0, Math.round(colors[i * 4 + 0] * 255)));
    u8[bOffset + 25] = Math.min(255, Math.max(0, Math.round(colors[i * 4 + 1] * 255)));
    u8[bOffset + 26] = Math.min(255, Math.max(0, Math.round(colors[i * 4 + 2] * 255)));
    u8[bOffset + 27] = Math.min(255, Math.max(0, Math.round(colors[i * 4 + 3] * 255)));

    const qw = quats ? quats[i * 4 + 0] : 1;
    const qx = quats ? quats[i * 4 + 1] : 0;
    const qy = quats ? quats[i * 4 + 2] : 0;
    const qz = quats ? quats[i * 4 + 3] : 0;
    u8[bOffset + 28] = Math.min(255, Math.max(0, Math.round(qw * 128 + 128)));
    u8[bOffset + 29] = Math.min(255, Math.max(0, Math.round(qx * 128 + 128)));
    u8[bOffset + 30] = Math.min(255, Math.max(0, Math.round(qy * 128 + 128)));
    u8[bOffset + 31] = Math.min(255, Math.max(0, Math.round(qz * 128 + 128)));
  }

  return buffer;
}

interface BoxPart {
  center: [number, number, number];
  size: [number, number, number];
  color: [number, number, number];
  density: number;
  alpha: number;
  skipTop?: boolean;
}

function generateBoxSplats(parts: BoxPart[]): ParsedSplatData {
  const posArr: number[] = [];
  const sclArr: number[] = [];
  const colArr: number[] = [];
  const quatArr: number[] = [];

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646 - 0.5;
  };

  for (const part of parts) {
    const [cx, cy, cz] = part.center;
    const [sx, sy, sz] = part.size;
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const d = part.density;

    const faces: Array<{
      axis: "x" | "y" | "z";
      r1: [number, number];
      r2: [number, number];
      fixed: number;
      normal: [number, number, number];
    }> = [
      { axis: "y", r1: [cx - hx, cx + hx], r2: [cz - hz, cz + hz], fixed: cy - hy, normal: [0, -1, 0] },
      { axis: "x", r1: [cy - hy, cy + hy], r2: [cz - hz, cz + hz], fixed: cx - hx, normal: [-1, 0, 0] },
      { axis: "x", r1: [cy - hy, cy + hy], r2: [cz - hz, cz + hz], fixed: cx + hx, normal: [1, 0, 0] },
      { axis: "z", r1: [cx - hx, cx + hx], r2: [cy - hy, cy + hy], fixed: cz - hz, normal: [0, 0, -1] },
      { axis: "z", r1: [cx - hx, cx + hx], r2: [cy - hy, cy + hy], fixed: cz + hz, normal: [0, 0, 1] },
    ];
    if (!part.skipTop) {
      faces.push({ axis: "y", r1: [cx - hx, cx + hx], r2: [cz - hz, cz + hz], fixed: cy + hy, normal: [0, 1, 0] });
    }

    for (const f of faces) {
      const l1 = Math.max(0.2, f.r1[1] - f.r1[0]);
      const l2 = Math.max(0.2, f.r2[1] - f.r2[0]);
      const n1 = Math.max(4, Math.floor(l1 * d));
      const n2 = Math.max(4, Math.floor(l2 * d));
      const q = normalToQuaternion(f.normal[0], f.normal[1], f.normal[2]);

      for (let i = 0; i < n1; i++) {
        for (let j = 0; j < n2; j++) {
          const u = f.r1[0] + ((i + 0.5) / n1) * l1 + rand() * 0.008;
          const v = f.r2[0] + ((j + 0.5) / n2) * l2 + rand() * 0.008;
          const fx = f.fixed + rand() * 0.002;

          let px = 0,
            py = 0,
            pz = 0;
          if (f.axis === "y") {
            px = u;
            py = fx;
            pz = v;
          } else if (f.axis === "x") {
            px = fx;
            py = u;
            pz = v;
          } else {
            px = u;
            py = v;
            pz = fx;
          }

          posArr.push(px, py, pz);
          const s = 1.38 / d;
          sclArr.push(s, s, 0.003);
          quatArr.push(q[0], q[1], q[2], q[3]);

          const shade = 1.0 - 0.07 * Math.sin(px * 2.2) + 0.05 * (py / 2.2) + rand() * 0.03;
          colArr.push(
            Math.min(1, Math.max(0, (part.color[0] / 255) * shade)),
            Math.min(1, Math.max(0, (part.color[1] / 255) * shade)),
            Math.min(1, Math.max(0, (part.color[2] / 255) * shade)),
            part.alpha
          );
        }
      }
    }
  }

  return {
    count: posArr.length / 3,
    positions: new Float32Array(posArr),
    scales: new Float32Array(sclArr),
    colors: new Float32Array(colArr),
    quats: new Float32Array(quatArr),
  };
}

export function generateSampleRoomSplatData(preset: "yeoksam" | "yeonnam"): ParsedSplatData {
  if (preset === "yeoksam") {
    return generateBoxSplats([
      // 외벽 및 원목 마루 바닥
      { center: [0, 0, 0], size: [6.4, 2.5, 4.8], color: [238, 234, 226], density: 18, alpha: 0.82, skipTop: true },
      { center: [0, -1.24, 0], size: [6.36, 0.02, 4.76], color: [186, 148, 108], density: 26, alpha: 0.98 },
      // 거실-침실 분리 가벽
      { center: [0.4, 0, -0.9], size: [0.14, 2.48, 2.9], color: [226, 222, 214], density: 20, alpha: 0.94 },
      // 남향 통창 및 햇살 패치
      { center: [-1.4, 0.15, -2.36], size: [2.6, 1.5, 0.05], color: [190, 230, 255], density: 28, alpha: 0.85 },
      { center: [-1.4, -1.22, -1.4], size: [2.4, 0.01, 1.5], color: [250, 236, 195], density: 24, alpha: 0.75 },
      // 패브릭 소파 & 거실 테이블 & 러그
      { center: [-2.1, -0.88, -0.2], size: [0.85, 0.72, 2.1], color: [218, 210, 198], density: 24, alpha: 0.98 },
      { center: [-1.0, -1.22, -0.2], size: [1.5, 0.02, 1.9], color: [212, 206, 196], density: 22, alpha: 0.94 },
      { center: [-0.95, -0.98, -0.2], size: [0.65, 0.45, 1.15], color: [142, 98, 62], density: 26, alpha: 0.98 },
      // 주방 아일랜드
      { center: [-1.5, -0.8, 1.75], size: [2.2, 0.88, 0.75], color: [85, 92, 102], density: 22, alpha: 0.98 },
      { center: [-1.5, -0.34, 1.75], size: [2.24, 0.05, 0.8], color: [245, 245, 247], density: 26, alpha: 0.99 },
      // 우측 침실 침대 & 옷장
      { center: [1.95, -0.92, -1.15], size: [1.65, 0.55, 2.05], color: [235, 238, 244], density: 24, alpha: 0.98 },
      { center: [1.95, -0.55, -2.1], size: [1.68, 1.1, 0.12], color: [135, 95, 62], density: 24, alpha: 0.98 },
      { center: [2.82, -0.15, 1.05], size: [0.62, 2.15, 1.85], color: [240, 238, 232], density: 20, alpha: 0.97 },
    ]);
  }

  return generateBoxSplats([
    { center: [0, 0, 0], size: [5.2, 2.6, 4.4], color: [242, 240, 235], density: 18, alpha: 0.82, skipTop: true },
    { center: [0, -1.29, 0], size: [5.16, 0.02, 4.36], color: [214, 210, 202], density: 26, alpha: 0.98 },
    { center: [0, 0.1, -2.16], size: [3.4, 1.75, 0.05], color: [185, 228, 245], density: 28, alpha: 0.85 },
    { center: [-1.95, -0.75, -1.75], size: [0.48, 1.05, 0.48], color: [68, 138, 82], density: 28, alpha: 0.96 },
    { center: [1.45, -0.95, -0.85], size: [1.5, 0.52, 2.0], color: [208, 218, 228], density: 24, alpha: 0.98 },
    { center: [0.45, -0.35, -0.95], size: [0.08, 1.85, 2.15], color: [175, 138, 98], density: 22, alpha: 0.88 },
    { center: [-1.65, -0.88, 0.25], size: [0.72, 0.76, 1.45], color: [125, 88, 56], density: 26, alpha: 0.98 },
    { center: [-0.85, -0.92, 0.25], size: [0.58, 0.72, 0.58], color: [72, 76, 84], density: 26, alpha: 0.98 },
    { center: [1.2, -0.82, 1.72], size: [1.9, 0.88, 0.68], color: [225, 228, 230], density: 22, alpha: 0.98 },
  ]);
}

/**
 * 백엔드 서버가 꺼져있거나 Vercel 단독 환경일 때 브라우저에서 직접 동영상을 분석하여
 * 3D 볼류메트릭 .splat 데이터를 생성합니다.
 */
export async function convertVideoToSplatClientSide(
  file: File,
  onProgress?: (progress: number, stage: string) => void
): Promise<{ splatData: ParsedSplatData; splatBuffer: ArrayBuffer; thumbDataUrl: string }> {
  onProgress?.(10, "동영상 로드 및 키프레임 샘플링 준비 중...");

  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("동영상을 읽을 수 없습니다."));
  });

  const duration = Math.max(0.5, video.duration || 5);
  const numFrames = 32;
  const sw = 68;
  const sh = 52;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = 480;
  thumbCanvas.height = 320;
  const thumbCtx = thumbCanvas.getContext("2d")!;
  let thumbDataUrl = "";

  const posArr: number[] = [];
  const sclArr: number[] = [];
  const colArr: number[] = [];
  const quatArr: number[] = [];

  const roomRx = 2.7;
  const roomRy = 1.35;
  const roomRz = 2.4;

  for (let i = 0; i < numFrames; i++) {
    const t = (i / numFrames) * duration * 0.96;
    video.currentTime = t;
    await new Promise<void>((r) => {
      const handler = () => {
        video.removeEventListener("seeked", handler);
        r();
      };
      video.addEventListener("seeked", handler);
    });

    ctx.drawImage(video, 0, 0, sw, sh);
    if (i === Math.floor(numFrames / 3)) {
      thumbCtx.drawImage(video, 0, 0, 480, 320);
      thumbDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.85);
    }

    const imgData = ctx.getImageData(0, 0, sw, sh).data;
    const baseYaw = (i / numFrames) * Math.PI * 2.0;
    const framePos = new Float32Array(sh * sw * 3);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const r = imgData[idx] / 255;
        const g = imgData[idx + 1] / 255;
        const b = imgData[idx + 2] / 255;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        const u = (x / (sw - 1) - 0.5) * 1.08;
        const v = (0.5 - y / (sh - 1)) * 0.84;

        const yaw = baseYaw + u * 1.15;
        const pitch = v * 0.88;

        const dx = Math.sin(yaw) * Math.cos(pitch);
        const dy = Math.sin(pitch);
        const dz = -Math.cos(yaw) * Math.cos(pitch);

        const tx = roomRx / Math.max(Math.abs(dx), 1e-4);
        const ty = roomRy / Math.max(Math.abs(dy), 1e-4);
        const tz = roomRz / Math.max(Math.abs(dz), 1e-4);
        const tBox = Math.min(tx, ty, tz);

        const relief = 1.0 - 0.22 * (1.0 - luma);
        const dist = tBox * Math.max(0.58, Math.min(1.02, relief));

        const px = dx * dist;
        const py = dy * dist;
        const pz = dz * dist;
        const gIdx = (y * sw + x) * 3;
        framePos[gIdx + 0] = px;
        framePos[gIdx + 1] = py;
        framePos[gIdx + 2] = pz;

        posArr.push(px, py, pz);
        colArr.push(r, g, b, 0.92);
      }
    }

    const { scales: fScales, quats: fQuats } = computeGridSurfels(framePos, sh, sw, [0, 0, 0]);
    for (let k = 0; k < fScales.length; k++) sclArr.push(fScales[k]);
    for (let k = 0; k < fQuats.length; k++) quatArr.push(fQuats[k]);

    if (i % 4 === 0) {
      const pct = Math.min(92, Math.round(15 + (i / numFrames) * 75));
      onProgress?.(pct, `키프레임 (${i + 1}/${numFrames}) 카메라 포즈 & 2D Surfel 평면 생성 중...`);
    }
  }

  URL.revokeObjectURL(videoUrl);

  const splatData: ParsedSplatData = {
    count: posArr.length / 3,
    positions: new Float32Array(posArr),
    scales: new Float32Array(sclArr),
    colors: new Float32Array(colArr),
    quats: new Float32Array(quatArr),
  };

  onProgress?.(98, `2DGS Surfel 버퍼 (${splatData.count.toLocaleString()} surfels) 패키징 중...`);
  const splatBuffer = encodeSplatArrayBuffer(splatData);
  onProgress?.(100, `3D 평면/메시 변환 완료 (${splatData.count.toLocaleString()} surfels)`);

  return { splatData, splatBuffer, thumbDataUrl };
}

const DB_NAME = "myroom_3d_splats_db";
const STORE_NAME = "splat_buffers";

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalSplatBuffer(roomId: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(buffer, roomId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadLocalSplatBuffer(roomId: string): Promise<ArrayBuffer | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(roomId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

