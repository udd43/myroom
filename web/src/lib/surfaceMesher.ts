import { ParsedSplatData } from "@/types/room";

export interface ReconstructedSurfaceResult {
  meshPositions: Float32Array;
  meshNormals: Float32Array;
  meshColors: Float32Array;
  meshQuadUvs: Float32Array;
  creasePositions: Float32Array;
  creaseColors: Float32Array;
  wirePositions: Float32Array;
  wireColors: Float32Array;
  quadCount: number;
  triangleCount: number;
  voxelSize: number;
}

/**
 * 직교 기저 (t_u, t_v, normal) 행렬을 단위 쿼터니언 [w, x, y, z]로 변환합니다.
 * 로컬 XY 평면이 (t_u, t_v) 접평면에 정렬되고, 로컬 +Z 축이 normal 방향을 향합니다.
 */
export function basisToQuaternion(
  tux: number,
  tuy: number,
  tuz: number,
  tvx: number,
  tvy: number,
  tvz: number,
  nx: number,
  ny: number,
  nz: number
): [number, number, number, number] {
  const m00 = tux,
    m01 = tvx,
    m02 = nx;
  const m10 = tuy,
    m11 = tvy,
    m12 = ny;
  const m20 = tuz,
    m21 = tvz,
    m22 = nz;

  const trace = m00 + m11 + m22;
  let w = 1,
    x = 0,
    y = 0,
    z = 0;

  if (trace > 0) {
    const s = Math.sqrt(Math.max(1e-8, trace + 1.0)) * 2.0;
    w = 0.25 * s;
    x = (m21 - m12) / s;
    y = (m02 - m20) / s;
    z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(Math.max(1e-8, 1.0 + m00 - m11 - m22)) * 2.0;
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(Math.max(1e-8, 1.0 + m11 - m00 - m22)) * 2.0;
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(Math.max(1e-8, 1.0 + m22 - m00 - m11)) * 2.0;
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }

  const len = Math.hypot(w, x, y, z) || 1.0;
  return [w / len, x / len, y / len, z / len];
}

/**
 * 단위 법선 벡터 [nx, ny, nz]에 로컬 +Z 축을 정렬하는 쿼터니언 [w, x, y, z]를 생성합니다.
 */
export function normalToQuaternion(
  nx: number,
  ny: number,
  nz: number
): [number, number, number, number] {
  const nLen = Math.hypot(nx, ny, nz) || 1.0;
  const ux = nx / nLen;
  const uy = ny / nLen;
  const uz = nz / nLen;

  // 상향 벡터와 외적하여 직교 접선 (t_u, t_v) 구성
  const upX = Math.abs(uy) > 0.92 ? 1 : 0;
  const upY = Math.abs(uy) > 0.92 ? 0 : 1;
  const upZ = 0;

  let tux = upY * uz - upZ * uy;
  let tuy = upZ * ux - upX * uz;
  let tuz = upX * uy - upY * ux;
  const tuLen = Math.hypot(tux, tuy, tuz) || 1.0;
  tux /= tuLen;
  tuy /= tuLen;
  tuz /= tuLen;

  let tvx = uy * tuz - uz * tuy;
  let tvy = uz * tux - ux * tuz;
  let tvz = ux * tuy - uy * tux;
  const tvLen = Math.hypot(tvx, tvy, tvz) || 1.0;
  tvx /= tvLen;
  tvy /= tvLen;
  tvz /= tvLen;

  return basisToQuaternion(tux, tuy, tuz, tvx, tvy, tvz, ux, uy, uz);
}

/**
 * 단위 쿼터니언 (w, x, y, z)에 의해 회전된 로컬 +Z 법선 벡터를 반환합니다.
 */
export function quatToNormal(
  w: number,
  x: number,
  y: number,
  z: number
): [number, number, number] {
  const nx = 2.0 * (w * y + x * z);
  const ny = 2.0 * (y * z - w * x);
  const nz = 1.0 - 2.0 * (x * x + y * y);
  const len = Math.hypot(nx, ny, nz) || 1.0;
  return [nx / len, ny / len, nz / len];
}

/**
 * 투영 격자(sh x sw) 포인트로부터 2DGS 접평면 스케일과 회전 쿼터니언을 계산합니다.
 */
export function computeGridSurfels(
  positions: Float32Array,
  sh: number,
  sw: number,
  camOrigin: [number, number, number] = [0, 0, 0]
): { scales: Float32Array; quats: Float32Array } {
  const count = sh * sw;
  const scales = new Float32Array(count * 3);
  const quats = new Float32Array(count * 4);

  const getP = (r: number, c: number): [number, number, number] => {
    const idx = (r * sw + c) * 3;
    return [positions[idx], positions[idx + 1], positions[idx + 2]];
  };

  for (let r = 0; r < sh; r++) {
    for (let c = 0; c < sw; c++) {
      const idx = r * sw + c;
      const [px, py, pz] = getP(r, c);

      // X 방향 접선 (깊이 단절 시 한쪽 차분 fallback)
      const cL = Math.max(0, c - 1);
      const cR = Math.min(sw - 1, c + 1);
      const pL = getP(r, cL);
      const pR = getP(r, cR);
      let dux = pR[0] - pL[0];
      let duy = pR[1] - pL[1];
      let duz = pR[2] - pL[2];
      let stepU = Math.max(1, cR - cL);

      if (Math.hypot(dux, duy, duz) / stepU > 0.35) {
        if (c < sw - 1) {
          const pNext = getP(r, c + 1);
          const dNext = Math.hypot(pNext[0] - px, pNext[1] - py, pNext[2] - pz);
          if (dNext < 0.35 || c === 0) {
            dux = pNext[0] - px;
            duy = pNext[1] - py;
            duz = pNext[2] - pz;
            stepU = 1;
          }
        }
        if (Math.hypot(dux, duy, duz) / stepU > 0.35 && c > 0) {
          dux = px - pL[0];
          duy = py - pL[1];
          duz = pz - pL[2];
          stepU = 1;
        }
      }

      // Y 방향 접선 (화면 아래->위 기준 dv)
      const rU = Math.max(0, r - 1);
      const rD = Math.min(sh - 1, r + 1);
      const pU = getP(rU, c);
      const pD = getP(rD, c);
      let dvx = pU[0] - pD[0];
      let dvy = pU[1] - pD[1];
      let dvz = pU[2] - pD[2];
      let stepV = Math.max(1, rD - rU);

      if (Math.hypot(dvx, dvy, dvz) / stepV > 0.35) {
        if (r > 0) {
          const dUp = Math.hypot(pU[0] - px, pU[1] - py, pU[2] - pz);
          if (dUp < 0.35 || r === sh - 1) {
            dvx = pU[0] - px;
            dvy = pU[1] - py;
            dvz = pU[2] - pz;
            stepV = 1;
          }
        }
        if (Math.hypot(dvx, dvy, dvz) / stepV > 0.35 && r < sh - 1) {
          dvx = px - pD[0];
          dvy = py - pD[1];
          dvz = pz - pD[2];
          stepV = 1;
        }
      }

      const spanU = Math.hypot(dux, duy, duz) / stepU;
      const spanV = Math.hypot(dvx, dvy, dvz) / stepV;

      let nx = duy * dvz - duz * dvy;
      let ny = duz * dvx - dux * dvz;
      let nz = dux * dvy - duy * dvx;
      let nLen = Math.hypot(nx, ny, nz);

      const camVecX = camOrigin[0] - px;
      const camVecY = camOrigin[1] - py;
      const camVecZ = camOrigin[2] - pz;

      if (nLen < 1e-6) {
        const cLen = Math.hypot(camVecX, camVecY, camVecZ) || 1.0;
        nx = camVecX / cLen;
        ny = camVecY / cLen;
        nz = camVecZ / cLen;
        const q = normalToQuaternion(nx, ny, nz);
        quats[idx * 4 + 0] = q[0];
        quats[idx * 4 + 1] = q[1];
        quats[idx * 4 + 2] = q[2];
        quats[idx * 4 + 3] = q[3];
      } else {
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;
        if (nx * camVecX + ny * camVecY + nz * camVecZ < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        // t_u를 법선에 직교 투영
        const dotUN = dux * nx + duy * ny + duz * nz;
        let tux = dux - dotUN * nx;
        let tuy = duy - dotUN * ny;
        let tuz = duz - dotUN * nz;
        const tuLen = Math.hypot(tux, tuy, tuz);
        if (tuLen < 1e-6) {
          const q = normalToQuaternion(nx, ny, nz);
          quats[idx * 4 + 0] = q[0];
          quats[idx * 4 + 1] = q[1];
          quats[idx * 4 + 2] = q[2];
          quats[idx * 4 + 3] = q[3];
        } else {
          tux /= tuLen;
          tuy /= tuLen;
          tuz /= tuLen;
          let tvx = ny * tuz - nz * tuy;
          let tvy = nz * tux - nx * tuz;
          let tvz = nx * tuy - ny * tux;
          const tvLen = Math.hypot(tvx, tvy, tvz) || 1.0;
          tvx /= tvLen;
          tvy /= tvLen;
          tvz /= tvLen;

          const q = basisToQuaternion(tux, tuy, tuz, tvx, tvy, tvz, nx, ny, nz);
          quats[idx * 4 + 0] = q[0];
          quats[idx * 4 + 1] = q[1];
          quats[idx * 4 + 2] = q[2];
          quats[idx * 4 + 3] = q[3];
        }
      }

      scales[idx * 3 + 0] = Math.min(0.088, Math.max(0.014, spanU * 0.78));
      scales[idx * 3 + 1] = Math.min(0.088, Math.max(0.014, spanV * 0.78));
      scales[idx * 3 + 2] = 0.003;
    }
  }

  return { scales, quats };
}

/**
 * 3x3 대칭 공분산 행렬에서 최소 고유값에 해당하는 고유벡터(표면 법선)를 Jacobi 회전으로 구합니다.
 */
function smallestEigenvector3x3(
  cxx: number,
  cxy: number,
  cxz: number,
  cyy: number,
  cyz: number,
  czz: number
): [number, number, number] {
  const a = [cxx, cxy, cxz, cxy, cyy, cyz, cxz, cyz, czz];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const pairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];

  for (let sweep = 0; sweep < 6; sweep++) {
    for (const [p, q] of pairs) {
      const apq = a[p * 3 + q];
      if (Math.abs(apq) < 1e-10) continue;
      const app = a[p * 3 + p];
      const aqq = a[q * 3 + q];
      const tau = (aqq - app) / (2.0 * apq);
      const t =
        tau >= 0
          ? 1.0 / (tau + Math.sqrt(1.0 + tau * tau))
          : -1.0 / (-tau + Math.sqrt(1.0 + tau * tau));
      const c = 1.0 / Math.sqrt(1.0 + t * t);
      const s = t * c;

      a[p * 3 + p] = app - t * apq;
      a[q * 3 + q] = aqq + t * apq;
      a[p * 3 + q] = 0;
      a[q * 3 + p] = 0;

      const r = 3 - p - q;
      const arp = a[r * 3 + p];
      const arq = a[r * 3 + q];
      a[r * 3 + p] = a[p * 3 + r] = c * arp - s * arq;
      a[r * 3 + q] = a[q * 3 + r] = s * arp + c * arq;

      for (let row = 0; row < 3; row++) {
        const vip = v[row * 3 + p];
        const viq = v[row * 3 + q];
        v[row * 3 + p] = c * vip - s * viq;
        v[row * 3 + q] = s * vip + c * viq;
      }
    }
  }

  let minCol = 0;
  if (a[4] < a[minCol * 4]) minCol = 1;
  if (a[8] < a[minCol * 4]) minCol = 2;

  const nx = v[minCol];
  const ny = v[3 + minCol];
  const nz = v[6 + minCol];
  const len = Math.hypot(nx, ny, nz) || 1.0;
  return [nx / len, ny / len, nz / len];
}

function packVoxelKey(ix: number, iy: number, iz: number): number {
  return (ix + 512) + (iy + 512) * 1024 + (iz + 512) * 1048576;
}

/**
 * 회전/평면 정보가 없는 기존 공(구형 3DGS) 데이터에 대해
 * 3D 공간 해시 PCA 기반 평면 법선과 2D Surfel 회전 쿼터니언을 자동 추정합니다.
 */
export function ensureOrientedSurfels(data: ParsedSplatData): ParsedSplatData {
  const { count, positions, scales, colors, quats } = data;
  if (count === 0) return data;

  const sampleStep = Math.max(1, Math.floor(count / 240));
  let planarCount = 0;
  let rotatedCount = 0;
  let sampled = 0;

  for (let i = 0; i < count; i += sampleStep) {
    sampled++;
    const sx = scales[i * 3 + 0];
    const sy = scales[i * 3 + 1];
    const sz = scales[i * 3 + 2];
    const maxS = Math.max(sx, sy, sz, 1e-6);
    if (sz / maxS < 0.28) planarCount++;
    const qw = quats[i * 4 + 0];
    if (Math.abs(qw) < 0.996) rotatedCount++;
  }

  if (planarCount > sampled * 0.65 && rotatedCount > sampled * 0.35) {
    return data;
  }

  // 비정렬 구형 포인트 -> 3D spatial hash PCA로 법선 + 접평면 쿼터니언 계산
  const cellSize = 0.16;
  const invCell = 1.0 / cellSize;

  const buckets = new Map<
    number,
    {
      indices: number[];
      sx: number;
      sy: number;
      sz: number;
    }
  >();

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3 + 0];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const ix = Math.floor(px * invCell);
    const iy = Math.floor(py * invCell);
    const iz = Math.floor(pz * invCell);
    const key = packVoxelKey(ix, iy, iz);
    let b = buckets.get(key);
    if (!b) {
      b = { indices: [], sx: 0, sy: 0, sz: 0 };
      buckets.set(key, b);
    }
    b.indices.push(i);
    b.sx += px;
    b.sy += py;
    b.sz += pz;
  }

  const outScales = new Float32Array(count * 3);
  const outQuats = new Float32Array(count * 4);

  for (const [key, b] of buckets.entries()) {
    const idxs = b.indices;
    // 점이 5개 미만인 가장자리 복셀은 3x3x3 이웃 점을 포함해 공분산 안정화
    const neighborPts: number[] = [];
    if (idxs.length >= 6) {
      for (const idx of idxs) neighborPts.push(idx);
    } else {
      const rem = key % 1024;
      const ix = rem - 512;
      const tmp = (key - rem) / 1024;
      const iy = (tmp % 1024) - 512;
      const iz = Math.floor(tmp / 1024) - 512;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const nb = buckets.get(packVoxelKey(ix + dx, iy + dy, iz + dz));
            if (nb) {
              for (const idx of nb.indices) {
                neighborPts.push(idx);
                if (neighborPts.length >= 36) break;
              }
            }
            if (neighborPts.length >= 36) break;
          }
          if (neighborPts.length >= 36) break;
        }
        if (neighborPts.length >= 36) break;
      }
    }

    let nx = 0,
      ny = 1,
      nz = 0;

    if (neighborPts.length >= 4) {
      let mx = 0,
        my = 0,
        mz = 0;
      const mCount = neighborPts.length;
      for (let k = 0; k < mCount; k++) {
        const pi = neighborPts[k] * 3;
        mx += positions[pi];
        my += positions[pi + 1];
        mz += positions[pi + 2];
      }
      mx /= mCount;
      my /= mCount;
      mz /= mCount;

      let cxx = 0,
        cxy = 0,
        cxz = 0,
        cyy = 0,
        cyz = 0,
        czz = 0;
      for (let k = 0; k < mCount; k++) {
        const pi = neighborPts[k] * 3;
        const dx = positions[pi] - mx;
        const dy = positions[pi + 1] - my;
        const dz = positions[pi + 2] - mz;
        cxx += dx * dx;
        cxy += dx * dy;
        cxz += dx * dz;
        cyy += dy * dy;
        cyz += dy * dz;
        czz += dz * dz;
      }
      [nx, ny, nz] = smallestEigenvector3x3(cxx, cxy, cxz, cyy, cyz, czz);
    } else {
      const pi = idxs[0] * 3;
      const vx = -positions[pi];
      const vy = -positions[pi + 1];
      const vz = -positions[pi + 2];
      const vl = Math.hypot(vx, vy, vz) || 1.0;
      nx = vx / vl;
      ny = vy / vl;
      nz = vz / vl;
    }

    const nCount = idxs.length;
    const cx = b.sx / nCount;
    const cy = b.sy / nCount;
    const cz = b.sz / nCount;
    if (nx * -cx + ny * -cy + nz * -cz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    const q = normalToQuaternion(nx, ny, nz);

    for (const i of idxs) {
      const s0 = scales[i * 3 + 0];
      const s1 = scales[i * 3 + 1];
      const baseS = Math.min(0.082, Math.max(0.018, (s0 + s1) * 0.65));
      outScales[i * 3 + 0] = baseS;
      outScales[i * 3 + 1] = baseS;
      outScales[i * 3 + 2] = 0.003;

      outQuats[i * 4 + 0] = q[0];
      outQuats[i * 4 + 1] = q[1];
      outQuats[i * 4 + 2] = q[2];
      outQuats[i * 4 + 3] = q[3];
    }
  }

  return {
    count,
    positions,
    scales: outScales,
    colors,
    quats: outQuats,
  };
}

interface AxisVoxelNode {
  ix: number;
  iy: number;
  iz: number;
  axis: 0 | 1 | 2;
  key: number;
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  r: number;
  g: number;
  b: number;
  count: number;
}

function packAxisVoxelKey(
  ix: number,
  iy: number,
  iz: number,
  axis: 0 | 1 | 2
): number {
  return (
    axis +
    3 *
      ((ix + 512) + (iy + 512) * 1024 + (iz + 512) * 1048576)
  );
}

/**
 * 2D Surfel 포인트 클라우드를 3축 지배 평면 복셀 그리드(Manifold Axis-Plane Stitching)로 연결해
 * 매끄러운 폴리곤 면(Triangle Mesh), 4각 격자 UV, 그리고 건축 엣지/크리즈 선(LineSegments)을 복원합니다.
 */
export function reconstructSurfaceMeshAndLines(
  rawInput: ParsedSplatData
): ReconstructedSurfaceResult {
  const data = ensureOrientedSurfels(rawInput);
  const { count, positions, colors, quats } = data;

  const voxelSize = 0.105;
  const invVoxel = 1.0 / voxelSize;

  const voxelMap = new Map<number, AxisVoxelNode>();

  for (let i = 0; i < count; i++) {
    const a = colors[i * 4 + 3];
    if (a < 0.08) continue;

    const px = positions[i * 3 + 0];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    const qw = quats[i * 4 + 0];
    const qx = quats[i * 4 + 1];
    const qy = quats[i * 4 + 2];
    const qz = quats[i * 4 + 3];
    let [nx, ny, nz] = quatToNormal(qw, qx, qy, qz);

    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    const axis: 0 | 1 | 2 = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;

    const ix = Math.round(px * invVoxel);
    const iy = Math.round(py * invVoxel);
    const iz = Math.round(pz * invVoxel);
    const key = packAxisVoxelKey(ix, iy, iz, axis);

    let node = voxelMap.get(key);
    if (!node) {
      node = {
        ix,
        iy,
        iz,
        axis,
        key,
        px,
        py,
        pz,
        nx,
        ny,
        nz,
        r: colors[i * 4 + 0],
        g: colors[i * 4 + 1],
        b: colors[i * 4 + 2],
        count: 1,
      };
      voxelMap.set(key, node);
    } else {
      // 동일 평면 내 반대 방향 법선은 첫 샘플과 부호를 맞춰 상쇄 방지
      if (nx * node.nx + ny * node.ny + nz * node.nz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      node.px += px;
      node.py += py;
      node.pz += pz;
      node.nx += nx;
      node.ny += ny;
      node.nz += nz;
      node.r += colors[i * 4 + 0];
      node.g += colors[i * 4 + 1];
      node.b += colors[i * 4 + 2];
      node.count++;
    }
  }

  for (const node of voxelMap.values()) {
    const inv = 1.0 / node.count;
    node.px *= inv;
    node.py *= inv;
    node.pz *= inv;
    node.r *= inv;
    node.g *= inv;
    node.b *= inv;
    const nl = Math.hypot(node.nx, node.ny, node.nz) || 1.0;
    node.nx /= nl;
    node.ny /= nl;
    node.nz /= nl;
  }

  const meshPos: number[] = [];
  const meshNorm: number[] = [];
  const meshCol: number[] = [];
  const meshQuadUv: number[] = [];

  // 엣지별 인접 쿼드 기록 -> 경계선(Count=1) 및 꺾임선(Crease) 추출
  interface EdgeInfo {
    a: AxisVoxelNode;
    b: AxisVoxelNode;
    q1x: number;
    q1y: number;
    q1z: number;
    count: number;
    isCrease: boolean;
  }
  const edgeMap = new Map<string, EdgeInfo>();

  const maxStepDistSq = Math.pow(voxelSize * 2.45, 2);

  const findBestNeighbor = (
    base: AxisVoxelNode,
    axis: 0 | 1 | 2,
    u: number,
    v: number
  ): AxisVoxelNode | null => {
    let best: AxisVoxelNode | null = null;
    let bestDistSq = maxStepDistSq;

    for (const dDepth of [0, -1, 1]) {
      let nix = 0,
        niy = 0,
        niz = 0;
      if (axis === 0) {
        nix = base.ix + dDepth;
        niy = u;
        niz = v;
      } else if (axis === 1) {
        nix = u;
        niy = base.iy + dDepth;
        niz = v;
      } else {
        nix = u;
        niy = v;
        niz = base.iz + dDepth;
      }

      const cand = voxelMap.get(packAxisVoxelKey(nix, niy, niz, axis));
      if (!cand) continue;

      const dotN = Math.abs(
        base.nx * cand.nx + base.ny * cand.ny + base.nz * cand.nz
      );
      if (dotN < 0.72) continue;

      const dx = cand.px - base.px;
      const dy = cand.py - base.py;
      const dz = cand.pz - base.pz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = cand;
      }
    }
    return best;
  };

  const recordEdge = (
    a: AxisVoxelNode,
    b: AxisVoxelNode,
    qnx: number,
    qny: number,
    qnz: number
  ) => {
    const kMin = a.key < b.key ? a.key : b.key;
    const kMax = a.key < b.key ? b.key : a.key;
    const eKey = `${kMin}_${kMax}`;
    const existing = edgeMap.get(eKey);
    if (!existing) {
      edgeMap.set(eKey, {
        a,
        b,
        q1x: qnx,
        q1y: qny,
        q1z: qnz,
        count: 1,
        isCrease: false,
      });
    } else {
      existing.count++;
      const dotQ = Math.abs(
        existing.q1x * qnx + existing.q1y * qny + existing.q1z * qnz
      );
      if (dotQ < 0.88) {
        existing.isCrease = true;
      }
    }
  };

  const pushTri = (
    v0: AxisVoxelNode,
    uv0: [number, number],
    v1: AxisVoxelNode,
    uv1: [number, number],
    v2: AxisVoxelNode,
    uv2: [number, number]
  ) => {
    meshPos.push(v0.px, v0.py, v0.pz, v1.px, v1.py, v1.pz, v2.px, v2.py, v2.pz);
    meshNorm.push(
      v0.nx,
      v0.ny,
      v0.nz,
      v1.nx,
      v1.ny,
      v1.nz,
      v2.nx,
      v2.ny,
      v2.nz
    );
    meshCol.push(v0.r, v0.g, v0.b, v1.r, v1.g, v1.b, v2.r, v2.g, v2.b);
    meshQuadUv.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1]);
  };

  let quadCount = 0;

  for (const n00 of voxelMap.values()) {
    const axis = n00.axis;
    const u0 = axis === 0 ? n00.iy : n00.ix;
    const v0 = axis === 1 ? n00.iz : axis === 0 ? n00.iz : n00.iy;

    const n10 = findBestNeighbor(n00, axis, u0 + 1, v0);
    if (!n10) continue;
    const n01 = findBestNeighbor(n00, axis, u0, v0 + 1);
    if (!n01) continue;
    const n11 = findBestNeighbor(n10, axis, u0 + 1, v0 + 1) ?? findBestNeighbor(n01, axis, u0 + 1, v0 + 1);
    if (!n11) continue;

    // 쿼드 법선 및 대각선 비틀림 검사
    const e1x = n11.px - n00.px;
    const e1y = n11.py - n00.py;
    const e1z = n11.pz - n00.pz;
    const e2x = n01.px - n10.px;
    const e2y = n01.py - n10.py;
    const e2z = n01.pz - n10.pz;

    let qnx = e1y * e2z - e1z * e2y;
    let qny = e1z * e2x - e1x * e2z;
    let qnz = e1x * e2y - e1y * e2x;
    const qLen = Math.hypot(qnx, qny, qnz);
    if (qLen < 1e-6) continue;
    qnx /= qLen;
    qny /= qLen;
    qnz /= qLen;

    // 너무 일그러진 쿼드 제거
    if (
      Math.hypot(n11.px - n01.px, n11.py - n01.py, n11.pz - n01.pz) >
      voxelSize * 2.6
    ) {
      continue;
    }

    pushTri(n00, [0, 0], n10, [1, 0], n11, [1, 1]);
    pushTri(n00, [0, 0], n11, [1, 1], n01, [0, 1]);

    recordEdge(n00, n10, qnx, qny, qnz);
    recordEdge(n10, n11, qnx, qny, qnz);
    recordEdge(n11, n01, qnx, qny, qnz);
    recordEdge(n01, n00, qnx, qny, qnz);

    quadCount++;
  }

  const creasePos: number[] = [];
  const creaseCol: number[] = [];
  const wirePos: number[] = [];
  const wireCol: number[] = [];

  for (const e of edgeMap.values()) {
    const rAvg = (e.a.r + e.b.r) * 0.5;
    const gAvg = (e.a.g + e.b.g) * 0.5;
    const bAvg = (e.a.b + e.b.b) * 0.5;

    // 모든 4각 경계 엣지는 Wireframe 버퍼에 기록
    wirePos.push(e.a.px, e.a.py, e.a.pz, e.b.px, e.b.py, e.b.pz);
    const isStructural = e.count === 1 || e.isCrease;
    if (isStructural) {
      // 구조 외곽선(벽-바닥 교차선, 가구 엣지): 또렷하고 대비감 높은 선 색상
      const cr = Math.min(1, rAvg * 0.45 + 0.52);
      const cg = Math.min(1, gAvg * 0.45 + 0.55);
      const cb = Math.min(1, bAvg * 0.45 + 0.62);
      creasePos.push(e.a.px, e.a.py, e.a.pz, e.b.px, e.b.py, e.b.pz);
      creaseCol.push(cr, cg, cb, cr, cg, cb);

      wireCol.push(
        Math.min(1, rAvg * 0.5 + 0.5),
        Math.min(1, gAvg * 0.5 + 0.52),
        Math.min(1, bAvg * 0.5 + 0.58),
        Math.min(1, rAvg * 0.5 + 0.5),
        Math.min(1, gAvg * 0.5 + 0.52),
        Math.min(1, bAvg * 0.5 + 0.58)
      );
    } else {
      wireCol.push(
        rAvg * 0.72,
        gAvg * 0.74,
        bAvg * 0.78,
        rAvg * 0.72,
        gAvg * 0.74,
        bAvg * 0.78
      );
    }
  }

  return {
    meshPositions: new Float32Array(meshPos),
    meshNormals: new Float32Array(meshNorm),
    meshColors: new Float32Array(meshCol),
    meshQuadUvs: new Float32Array(meshQuadUv),
    creasePositions: new Float32Array(creasePos),
    creaseColors: new Float32Array(creaseCol),
    wirePositions: new Float32Array(wirePos),
    wireColors: new Float32Array(wireCol),
    quadCount,
    triangleCount: quadCount * 2,
    voxelSize,
  };
}

