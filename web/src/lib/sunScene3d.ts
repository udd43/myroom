import * as THREE from "three";
import { RoomItem } from "@/types/room";
import {
  calculateSolarPosition,
  computeRoomSunState,
  computeWindowFloorSunPolygons,
  RoomSunState,
} from "./sunlight";

const SUNBEAM_VERTEX = `
  attribute float aBeamT;
  varying float vBeamT;
  varying float vWorldY;

  void main() {
    vBeamT = aBeamT;
    vWorldY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUNBEAM_FRAGMENT = `
  uniform float uClipY;
  uniform vec3 uBeamColor;
  uniform float uOpacity;
  varying float vBeamT;
  varying float vWorldY;

  void main() {
    if (vWorldY > uClipY) discard;
    float fade = mix(0.75, 0.22, vBeamT);
    gl_FragColor = vec4(uBeamColor, uOpacity * fade);
  }
`;

export function disposeGroupChildren(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
      if (Array.isArray(mat)) {
        mat.forEach((x) => {
          if ((x as THREE.MeshBasicMaterial).map) (x as THREE.MeshBasicMaterial).map?.dispose();
          x.dispose();
        });
      } else if (mat) {
        if ((mat as THREE.MeshBasicMaterial).map) (mat as THREE.MeshBasicMaterial).map?.dispose();
        mat.dispose();
      }
    });
  }
}

function makeCardinalSprite(text: string, highlight = false): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, 96, 96);
  ctx.beginPath();
  ctx.arc(48, 48, 34, 0, Math.PI * 2);
  ctx.fillStyle = highlight ? "#b93800" : "rgba(17, 19, 24, 0.88)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = highlight ? "#ffd6c2" : "rgba(255, 255, 255, 0.45)";
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 48, 50);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.46, 0.46, 1);
  sprite.renderOrder = 6;
  return sprite;
}

/**
 * 3D 씬 안에 나침반 방위 링, 태양 이동 아크 궤적, 창문 채광 햇빛 기둥 & 바닥 패치를 구성합니다.
 */
export function updateSunOverlayGroup(
  group: THREE.Group,
  room: RoomItem,
  sunState: RoomSunState,
  opts: {
    dayOfYear: number;
    floorY: number;
    clipY: number;
    enabled: boolean;
  }
) {
  disposeGroupChildren(group);
  group.visible = opts.enabled;
  if (!opts.enabled) return;

  const { floorY, clipY, dayOfYear } = opts;
  const ringY = floorY + 0.015;
  const roomW = room.roomPlan?.widthM ?? 6.4;
  const roomD = room.roomPlan?.depthM ?? 4.8;
  const radius = Math.max(roomW, roomD) * 0.56 + 0.65;

  // 1. 나침반 원형 가이드 및 동·서·남·북 방위 마커
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.sin(a) * radius, ringY, -Math.cos(a) * radius));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  const ringMat = new THREE.LineBasicMaterial({ color: "#475569", transparent: true, opacity: 0.65 });
  group.add(new THREE.Line(ringGeo, ringMat));

  // 방위각(0=N, 90=E, 180=S, 270=W)을 3D 씬 좌표로 회전
  const deltaDeg = sunState.primaryWindowAzimuthDeg - sunState.roomFacingAzimuthDeg;
  const cardinals: Array<{ az: number; label: string; isNorth?: boolean }> = [
    { az: 0, label: "N", isNorth: true },
    { az: 90, label: "E" },
    { az: 180, label: "S" },
    { az: 270, label: "W" },
  ];
  for (const c of cardinals) {
    const rad = ((c.az + deltaDeg) * Math.PI) / 180;
    const sp = makeCardinalSprite(c.label, Boolean(c.isNorth));
    sp.position.set(Math.sin(rad) * radius, ringY + 0.14, -Math.cos(rad) * radius);
    group.add(sp);
  }

  // 2. 하루 태양 이동 아크 궤적 (06:00 ~ 19:00)
  const arcRadius = radius * 0.96;
  const arcPts: THREE.Vector3[] = [];
  for (let min = 6 * 60; min <= 19 * 60; min += 30) {
    const pos = calculateSolarPosition(dayOfYear, min, sunState.location.lat, sunState.location.lon);
    if (pos.altitudeDeg <= 0.5) continue;
    const azRad = ((pos.azimuthDeg + deltaDeg) * Math.PI) / 180;
    const altRad = (pos.altitudeDeg * Math.PI) / 180;
    arcPts.push(
      new THREE.Vector3(
        Math.sin(azRad) * Math.cos(altRad) * arcRadius,
        floorY + Math.sin(altRad) * arcRadius + 0.35,
        -Math.cos(azRad) * Math.cos(altRad) * arcRadius
      )
    );
  }
  if (arcPts.length >= 2) {
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineDashedMaterial({
      color: "#f59e0b",
      dashSize: 0.22,
      gapSize: 0.14,
      transparent: true,
      opacity: 0.72,
    });
    const arcLine = new THREE.Line(arcGeo, arcMat);
    arcLine.computeLineDistances();
    group.add(arcLine);
  }

  // 3. 현재 태양 오브젝트 (구체 + 룸 중심 향하는 광선 가이드)
  const [sx, sy, sz] = sunState.towardSunRoom;
  if (sunState.world.isDaylight) {
    const sunPos = new THREE.Vector3(
      sx * arcRadius,
      floorY + Math.max(0.25, sy * arcRadius + 0.35),
      sz * arcRadius
    );
    const sunColorHex = sunState.isDirectSunlight ? "#fbbf24" : "#94a3b8";
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshBasicMaterial({ color: sunColorHex })
    );
    orb.position.copy(sunPos);
    group.add(orb);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshBasicMaterial({
        color: sunColorHex,
        transparent: true,
        opacity: sunState.isDirectSunlight ? 0.28 : 0.14,
      })
    );
    halo.position.copy(sunPos);
    group.add(halo);
  }

  // 4. 창문 바닥 투영 채광 패치 & 반투명 볼류메트릭 빛 기둥 (직사광 유입 시)
  if (!sunState.isDirectSunlight) return;

  const polygons = computeWindowFloorSunPolygons(room, sunState);
  const sunVecColor = new THREE.Color(
    sunState.sunColor[0],
    sunState.sunColor[1],
    sunState.sunColor[2]
  );

  for (const win of sunState.windows) {
    const polyObj = polygons.find((p) => p.windowId === win.id);
    if (!polyObj || polyObj.polygon.length < 4) continue;

    // 4a. 바닥에 드리워지는 따뜻한 햇빛 패치 (Shape Geometry)
    const poly = polyObj.polygon;
    const shape = new THREE.Shape();
    shape.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      shape.lineTo(poly[i][0], poly[i][1]);
    }
    shape.closePath();

    const patchGeo = new THREE.ShapeGeometry(shape);
    patchGeo.rotateX(Math.PI / 2); // XY shape -> XZ plane (x, 0, z)
    // ShapeGeometry rotateX(+PI/2): (x, y, 0) -> (x, 0, y)
    const patchMat = new THREE.MeshBasicMaterial({
      color: sunVecColor,
      transparent: true,
      opacity: Math.min(0.46, 0.16 + sunState.directIntensity * 0.28),
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const patchMesh = new THREE.Mesh(patchGeo, patchMat);
    patchMesh.position.y = floorY + 0.02;
    patchMesh.renderOrder = 2;
    group.add(patchMesh);

    // 4b. 창틀에서 바닥 패치로 비스듬히 쏟아지는 반투명 햇빛 기둥 (Sides + Slanted Top/Bottom Shaft)
    const halfW = win.widthM * 0.48;
    const [tx, tz] = win.tangent;
    const wLx = win.x - tx * halfW;
    const wLz = win.z - tz * halfW;
    const wRx = win.x + tx * halfW;
    const wRz = win.z + tz * halfW;
    const yBot = floorY + win.sillHeightM;
    const yTop = floorY + win.headHeightM;
    const fy = floorY + 0.025;

    // polygon은 nearPts (0..steps) + reversed farPts (steps..0)
    const halfCount = poly.length / 2;
    const nearStart = poly[0];
    const nearEnd = poly[halfCount - 1];
    const farEnd = poly[halfCount]; // right far
    const farStart = poly[poly.length - 1]; // left far

    const verts: number[] = [];
    const beamTs: number[] = [];
    const pushQuad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number],
      ta: number,
      tb: number,
      tc: number,
      td: number
    ) => {
      verts.push(...a, ...b, ...c, ...a, ...c, ...d);
      beamTs.push(ta, tb, tc, ta, tc, td);
    };

    // 윗면(Top sunbeam sheet), 아랫면(Bottom), 좌측면, 우측면 4개 벽으로 빛 기둥 형성
    pushQuad([wLx, yTop, wLz], [wRx, yTop, wRz], [farEnd[0], fy, farEnd[1]], [farStart[0], fy, farStart[1]], 0, 0, 1, 1);
    pushQuad([wLx, yBot, wLz], [wRx, yBot, wRz], [nearEnd[0], fy, nearEnd[1]], [nearStart[0], fy, nearStart[1]], 0, 0, 1, 1);
    pushQuad([wLx, yTop, wLz], [wLx, yBot, wLz], [nearStart[0], fy, nearStart[1]], [farStart[0], fy, farStart[1]], 0, 0, 1, 1);
    pushQuad([wRx, yTop, wRz], [wRx, yBot, wRz], [nearEnd[0], fy, nearEnd[1]], [farEnd[0], fy, farEnd[1]], 0, 0, 1, 1);

    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    beamGeo.setAttribute("aBeamT", new THREE.Float32BufferAttribute(beamTs, 1));
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: SUNBEAM_VERTEX,
      fragmentShader: SUNBEAM_FRAGMENT,
      uniforms: {
        uClipY: { value: clipY },
        uBeamColor: { value: sunVecColor },
        uOpacity: { value: Math.min(0.24, 0.08 + sunState.directIntensity * 0.16) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.renderOrder = 3;
    group.add(beamMesh);
  }
}

/**
 * 주 창문의 Shader Uniform 파라미터를 계산해 VolumetricRoomViewer에 전달합니다.
 */
export function getPrimaryWindowShaderUniforms(sunState: RoomSunState, floorY: number) {
  const win = sunState.windows.reduce(
    (best, cur) => (cur.widthM > best.widthM ? cur : best),
    sunState.windows[0]
  );
  const midY = floorY + (win.sillHeightM + win.headHeightM) * 0.5;
  const halfH = (win.headHeightM - win.sillHeightM) * 0.5;

  return {
    winCenter: new THREE.Vector3(win.x, midY, win.z),
    winNormal: new THREE.Vector3(win.outwardNormal[0], 0, win.outwardNormal[1]).normalize(),
    winTangent: new THREE.Vector3(win.tangent[0], 0, win.tangent[1]).normalize(),
    winHalfSpan: new THREE.Vector2(win.widthM * 0.5, halfH),
  };
}

/**
 * Helper: given today's room sun state, compute daily hours quickly for display hooks.
 */
export function isWindowLitAt(
  room: RoomItem,
  dayOfYear: number,
  minutesOfDay: number,
  considerObstruction = true
): boolean {
  return computeRoomSunState(room, { dayOfYear, minutesOfDay, considerObstruction }).isDirectSunlight;
}

