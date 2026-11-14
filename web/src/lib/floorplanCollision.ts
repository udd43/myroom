import { FurnitureItem, RoomPlanData, RoomPlanOpening, RoomPlanWall } from "@/types/room";

export interface SpatialConflict {
  id: string;
  severity: "error" | "warn";
  kind: "door_swing" | "narrow_walkway" | "wall_overlap";
  message: string;
  furnitureIds: string[];
  xM: number;
  zM: number;
}

const MIN_WALKWAY_M = 0.6;

/** Compute the 2D oriented bounding box corners [x, z] for a placed furniture piece. */
export function getFurnitureCorners2D(item: FurnitureItem): Array<[number, number]> {
  const cx = item.position[0];
  const cz = item.position[2];
  const hw = item.widthM / 2;
  const hd = item.depthM / 2;
  const c = Math.cos(-item.rotationY);
  const s = Math.sin(-item.rotationY);

  const local: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return local.map(([lx, lz]) => [cx + lx * c - lz * s, cz + lx * s + lz * c]);
}

function pointToSegmentDist2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function pointToObbDistance2D(px: number, pz: number, item: FurnitureItem): number {
  const dx = px - item.position[0];
  const dz = pz - item.position[2];
  const c = Math.cos(item.rotationY);
  const s = Math.sin(item.rotationY);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const qx = Math.max(0, Math.abs(lx) - item.widthM / 2);
  const qz = Math.max(0, Math.abs(lz) - item.depthM / 2);
  return Math.hypot(qx, qz);
}

/** Approximate distance between two 2D OBBs using corner/center sampling + separating radius. */
function obbPairGap2D(a: FurnitureItem, b: FurnitureItem): number {
  const cornersA = getFurnitureCorners2D(a);
  const cornersB = getFurnitureCorners2D(b);
  let best = pointToObbDistance2D(b.position[0], b.position[2], a);
  best = Math.min(best, pointToObbDistance2D(a.position[0], a.position[2], b));
  for (const [cx, cz] of cornersA) best = Math.min(best, pointToObbDistance2D(cx, cz, b));
  for (const [cx, cz] of cornersB) best = Math.min(best, pointToObbDistance2D(cx, cz, a));
  // Edge midpoints refine long narrow pieces
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = cornersA[i];
    const [x2, z2] = cornersA[(i + 1) % 4];
    best = Math.min(best, pointToObbDistance2D((x1 + x2) / 2, (z1 + z2) / 2, b));
    const [bx1, bz1] = cornersB[i];
    const [bx2, bz2] = cornersB[(i + 1) % 4];
    best = Math.min(best, pointToObbDistance2D((bx1 + bx2) / 2, (bz1 + bz2) / 2, a));
  }
  return best;
}

/** Compute inward swing center of a RoomPlan door opening (always toward room center (0,0)). */
export function getDoorSwingArcGeometry(door: RoomPlanOpening): {
  hingeX: number;
  hingeZ: number;
  sweepX: number;
  sweepZ: number;
  inwardNx: number;
  inwardNz: number;
  radiusM: number;
} {
  const rad = ((door.rotationDeg || 0) * Math.PI) / 180;
  const tx = Math.cos(rad);
  const tz = Math.sin(rad);
  // Inward normal pointing toward room center (0, 0)
  let nx = -tz;
  let nz = tx;
  if (nx * -door.x + nz * -door.z < 0) {
    nx = -nx;
    nz = -nz;
  }
  const nLen = Math.hypot(nx, nz) || 1;
  const inX = nx / nLen;
  const inZ = nz / nLen;
  const radiusM = Math.max(0.7, door.widthM);
  const hingeX = door.x - tx * (radiusM / 2);
  const hingeZ = door.z - tz * (radiusM / 2);
  const sweepX = door.x + inX * (radiusM * 0.55);
  const sweepZ = door.z + inZ * (radiusM * 0.55);
  return { hingeX, hingeZ, sweepX, sweepZ, inwardNx: inX, inwardNz: inZ, radiusM };
}

/** Check door swing overlap, wall overlap, and <60cm walkway narrowing across 2D & 3D. */
export function analyzeLayoutConflicts(
  furnitures: FurnitureItem[],
  plan: RoomPlanData
): SpatialConflict[] {
  const conflicts: SpatialConflict[] = [];
  const doors = plan.openings.filter((o) => o.type === "door");
  const walls: RoomPlanWall[] = plan.walls || [];

  for (const item of furnitures) {
    const corners = getFurnitureCorners2D(item);

    // 1. Door swing collision check
    for (const door of doors) {
      const arc = getDoorSwingArcGeometry(door);
      // Sample points inside the inward quarter-circle swing arc
      let blocked = false;
      for (let i = 1; i <= 5 && !blocked; i++) {
        const a = (i / 5) * (Math.PI / 2);
        const rad = ((door.rotationDeg || 0) * Math.PI) / 180;
        const tx = Math.cos(rad);
        const tz = Math.sin(rad);
        for (const rFrac of [0.45, 0.78, 0.95]) {
          const r = arc.radiusM * rFrac;
          const sx = arc.hingeX + (tx * Math.cos(a) + arc.inwardNx * Math.sin(a)) * r;
          const sz = arc.hingeZ + (tz * Math.cos(a) + arc.inwardNz * Math.sin(a)) * r;
          if (pointToObbDistance2D(sx, sz, item) < 0.04) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) {
        conflicts.push({
          id: `door-${door.id}-${item.id}`,
          severity: "error",
          kind: "door_swing",
          message: `문 열림 반경 충돌: '${item.name}'이(가) 문 회전 구간을 막고 있습니다.`,
          furnitureIds: [item.id],
          xM: door.x,
          zM: door.z,
        });
      }
    }

    // 2. Wall collision / narrow wall gap (< 60cm when between furniture and wall, except flush wall-snapped < 12cm)
    for (const wall of walls) {
      let minDistToWall = Infinity;
      let centerIntersects = false;
      const centerDist = pointToSegmentDist2D(item.position[0], item.position[2], wall.x1, wall.z1, wall.x2, wall.z2);
      const halfMinSpan = Math.min(item.widthM, item.depthM) * 0.45;
      if (centerDist < halfMinSpan - 0.05) {
        centerIntersects = true;
      }
      for (const [cx, cz] of corners) {
        minDistToWall = Math.min(minDistToWall, pointToSegmentDist2D(cx, cz, wall.x1, wall.z1, wall.x2, wall.z2));
      }
      if (centerIntersects) {
        conflicts.push({
          id: `wall-hit-${wall.id}-${item.id}`,
          severity: "error",
          kind: "wall_overlap",
          message: `벽체 침범: '${item.name}'이(가) 벽을 통과하고 있습니다.`,
          furnitureIds: [item.id],
          xM: item.position[0],
          zM: item.position[2],
        });
        break;
      } else if (minDistToWall > 0.14 && minDistToWall < MIN_WALKWAY_M) {
        conflicts.push({
          id: `walk-wall-${wall.id}-${item.id}`,
          severity: "warn",
          kind: "narrow_walkway",
          message: `통로 협소 (${Math.round(minDistToWall * 100)}cm < 60cm): '${item.name}'과 벽 사이 간격을 확보하거나 벽에 밀착하세요.`,
          furnitureIds: [item.id],
          xM: item.position[0],
          zM: item.position[2],
        });
        break;
      }
    }
  }

  // 3. Pairwise furniture overlap or <60cm narrow aisle
  for (let i = 0; i < furnitures.length; i++) {
    for (let j = i + 1; j < furnitures.length; j++) {
      const a = furnitures[i];
      const b = furnitures[j];
      const gap = obbPairGap2D(a, b);
      if (gap < 0.02) {
        conflicts.push({
          id: `overlap-${a.id}-${b.id}`,
          severity: "error",
          kind: "wall_overlap",
          message: `가구 겹침: '${a.name}' ↔ '${b.name}' 배치가 겹칩니다.`,
          furnitureIds: [a.id, b.id],
          xM: (a.position[0] + b.position[0]) / 2,
          zM: (a.position[2] + b.position[2]) / 2,
        });
      } else if (gap > 0.05 && gap < MIN_WALKWAY_M) {
        conflicts.push({
          id: `aisle-${a.id}-${b.id}`,
          severity: "warn",
          kind: "narrow_walkway",
          message: `통로 폭 ${Math.round(gap * 100)}cm (< 60cm): '${a.name}' ↔ '${b.name}' 사이 동선이 좁습니다.`,
          furnitureIds: [a.id, b.id],
          xM: (a.position[0] + b.position[0]) / 2,
          zM: (a.position[2] + b.position[2]) / 2,
        });
      }
    }
  }

  return conflicts;
}

/** Snap rotation to nearest 15° (with strong pull at 0/90/180/270°), clamp floor Y, and magnet-snap to close walls. */
export function snapFurniturePose(
  item: FurnitureItem,
  posX: number,
  posY: number,
  posZ: number,
  rotYRad: number,
  opts: {
    floorY: number;
    plan?: RoomPlanData;
    snapAngleDeg?: number;
    snapToFloor?: boolean;
    snapToWalls?: boolean;
  }
): { position: [number, number, number]; rotationY: number } {
  const stepDeg = opts.snapAngleDeg ?? 15;
  const deg = ((rotYRad * 180) / Math.PI) % 360;
  const snappedDeg = stepDeg > 0 ? Math.round(deg / stepDeg) * stepDeg : deg;
  const finalRotY = +((snappedDeg * Math.PI) / 180).toFixed(3);

  let x = posX;
  let z = posZ;
  const y = opts.snapToFloor !== false ? +(opts.floorY + item.heightM / 2).toFixed(2) : +posY.toFixed(2);

  // Subtle magnetic snap when close to axis-aligned outer room walls
  if (opts.snapToWalls !== false && opts.plan) {
    const hw = (Math.abs(Math.cos(finalRotY)) * item.widthM + Math.abs(Math.sin(finalRotY)) * item.depthM) / 2;
    const hd = (Math.abs(Math.sin(finalRotY)) * item.widthM + Math.abs(Math.cos(finalRotY)) * item.depthM) / 2;
    const margin = 0.16;
    const minWallX = Math.min(...opts.plan.walls.map((w) => Math.min(w.x1, w.x2)));
    const maxWallX = Math.max(...opts.plan.walls.map((w) => Math.max(w.x1, w.x2)));
    const minWallZ = Math.min(...opts.plan.walls.map((w) => Math.min(w.z1, w.z2)));
    const maxWallZ = Math.max(...opts.plan.walls.map((w) => Math.max(w.z1, w.z2)));

    if (Math.abs(x - hw - minWallX) < margin) x = minWallX + hw + 0.03;
    else if (Math.abs(maxWallX - (x + hw)) < margin) x = maxWallX - hw - 0.03;

    if (Math.abs(z - hd - minWallZ) < margin) z = minWallZ + hd + 0.03;
    else if (Math.abs(maxWallZ - (z + hd)) < margin) z = maxWallZ - hd - 0.03;
  }

  return {
    position: [+x.toFixed(2), y, +z.toFixed(2)],
    rotationY: finalRotY,
  };
}
