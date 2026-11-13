"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import * as GaussianSplats3D from "@mkkellogg/gaussian-splats-3d";
import {
  Box,
  Compass,
  Download,
  Footprints,
  Grid3X3,
  Layers,
  MapPin,
  Ruler,
  Shapes,
  Sparkles,
  Sun,
  Waypoints,
} from "lucide-react";
import { CameraMode, FurnitureItem, ParsedSplatData, RoomItem, RoomPin } from "@/types/room";
import {
  encodeSplatArrayBuffer,
  generateSampleRoomSplatData,
  loadLocalSplatBuffer,
  parseSplatArrayBuffer,
} from "@/lib/splatClientGenerator";
import {
  ensureOrientedSurfels,
  reconstructSurfaceMeshAndLines,
  ReconstructedSurfaceResult,
} from "@/lib/surfaceMesher";
import {
  disposeGroupChildren,
  getPrimaryWindowShaderUniforms,
  updateSunOverlayGroup,
} from "@/lib/sunScene3d";
import { RoomSunState } from "@/lib/sunlight";
import { useSunlightState } from "@/hooks/useSunlightState";
import { engineLabel } from "@/lib/format";
import { MeasureBanner, PinLabels, PinPrompt, ViewerLoading } from "./ViewerOverlays";
import { FurniturePaletteBar, buildFurnitureGroup } from "./FurnitureControls";
import SunlightControlBar from "./SunlightControlBar";

export interface SyncedOrbitState {
  theta: number;
  phi: number;
  radius: number;
  target: [number, number, number];
}

interface Props {
  room: RoomItem;
  apiBaseUrl: string;
  compact?: boolean;
  syncedCamera?: SyncedOrbitState | null;
  onCameraSyncChange?: (state: SyncedOrbitState) => void;
  onAddPin?: (pin: Omit<RoomPin, "id">) => void;
  onUpdateFurnitures?: (items: FurnitureItem[]) => void;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
}

type ToolMode = "none" | "measure" | "pin" | "furniture" | "sun";
export type SplatRenderMode = "surfel" | "mesh" | "wire" | "blob";

const FLOOR_Y = -1.25;

const SUNLIGHT_GLSL = `
  uniform float uSunEnabled;
  uniform vec3 uSunDirToSun;
  uniform float uSunIntensity;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform float uSkyIntensity;
  uniform vec3 uWinCenter;
  uniform vec3 uWinNormal;
  uniform vec3 uWinTangent;
  uniform vec2 uWinHalfSpan;

  vec3 applyRoomSunlight(vec3 wPos, vec3 wNorm, vec3 baseCol) {
    if (uSunEnabled < 0.5) {
      float staticShade = 0.84 + 0.16 * abs(dot(normalize(wNorm), normalize(vec3(0.42, 0.85, 0.32))));
      return baseCol * staticShade;
    }
    vec3 n = normalize(wNorm);
    float skyDiff = 0.62 + 0.38 * abs(dot(n, uSunDirToSun));
    vec3 ambient = baseCol * uSkyColor * (0.46 + 0.58 * uSkyIntensity * skyDiff);

    if (uSunIntensity <= 0.01) {
      return clamp(ambient, 0.0, 1.0);
    }

    float denom = dot(uSunDirToSun, uWinNormal);
    float hitWeight = 0.0;
    if (denom > 0.04) {
      float tWin = dot(uWinCenter - wPos, uWinNormal) / denom;
      if (tWin > -0.18) {
        vec3 hitPt = wPos + uSunDirToSun * max(0.0, tWin);
        vec3 rel = hitPt - uWinCenter;
        float uDist = abs(dot(rel, uWinTangent));
        float vDist = abs(rel.y);
        float inU = 1.0 - smoothstep(uWinHalfSpan.x - 0.14, uWinHalfSpan.x + 0.08, uDist);
        float inV = 1.0 - smoothstep(uWinHalfSpan.y - 0.14, uWinHalfSpan.y + 0.08, vDist);
        float faceCos = max(abs(dot(n, uSunDirToSun)), 0.38);
        hitWeight = inU * inV * faceCos;
      }
    }
    vec3 direct = baseCol * uSunColor * (uSunIntensity * 0.96 * hitWeight);
    return clamp(ambient + direct, 0.0, 1.0);
  }
`;

function createSunUniforms(sunState: RoomSunState, enabled: boolean) {
  const win = getPrimaryWindowShaderUniforms(sunState, FLOOR_Y);
  return {
    uSunEnabled: { value: enabled ? 1.0 : 0.0 },
    uSunDirToSun: { value: new THREE.Vector3(...sunState.towardSunRoom).normalize() },
    uSunIntensity: { value: sunState.isDirectSunlight ? sunState.directIntensity : 0.0 },
    uSunColor: { value: new THREE.Vector3(...sunState.sunColor) },
    uSkyColor: { value: new THREE.Vector3(...sunState.skyColor) },
    uSkyIntensity: { value: sunState.skyIntensity },
    uWinCenter: { value: win.winCenter },
    uWinNormal: { value: win.winNormal },
    uWinTangent: { value: win.winTangent },
    uWinHalfSpan: { value: win.winHalfSpan },
  };
}

function syncMaterialSunUniforms(mat: THREE.ShaderMaterial, sunState: RoomSunState, enabled: boolean) {
  if (!mat.uniforms.uSunEnabled) return;
  const win = getPrimaryWindowShaderUniforms(sunState, FLOOR_Y);
  mat.uniforms.uSunEnabled.value = enabled ? 1.0 : 0.0;
  (mat.uniforms.uSunDirToSun.value as THREE.Vector3).set(...sunState.towardSunRoom).normalize();
  mat.uniforms.uSunIntensity.value = sunState.isDirectSunlight ? sunState.directIntensity : 0.0;
  (mat.uniforms.uSunColor.value as THREE.Vector3).set(...sunState.sunColor);
  (mat.uniforms.uSkyColor.value as THREE.Vector3).set(...sunState.skyColor);
  mat.uniforms.uSkyIntensity.value = sunState.skyIntensity;
  (mat.uniforms.uWinCenter.value as THREE.Vector3).copy(win.winCenter);
  (mat.uniforms.uWinNormal.value as THREE.Vector3).copy(win.winNormal);
  (mat.uniforms.uWinTangent.value as THREE.Vector3).copy(win.winTangent);
  (mat.uniforms.uWinHalfSpan.value as THREE.Vector2).copy(win.winHalfSpan);
}

const BLOB_VERTEX_SHADER = `
  attribute vec3 aScale;
  attribute vec4 aColor;
  uniform float uPointScale;
  uniform float uViewportHeight;
  uniform float uClipY;
  varying vec4 vColor;
  varying float vClipped;
  varying vec3 vWorldPos;

  void main() {
    vColor = aColor;
    vWorldPos = position;
    if (position.y > uClipY) {
      vClipped = 1.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vClipped = 0.0;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float avgScale = (aScale.x + aScale.y + aScale.z) * 0.3333;
    float dist = max(0.35, -mvPosition.z);
    gl_PointSize = clamp((avgScale * uPointScale * uViewportHeight) / dist, 2.0, 48.0);
  }
`;

const BLOB_FRAGMENT_SHADER = `
  varying vec4 vColor;
  varying float vClipped;
  varying vec3 vWorldPos;
  ${SUNLIGHT_GLSL}

  void main() {
    if (vClipped > 0.5) discard;
    vec2 coord = gl_PointCoord - vec2(0.5);
    float r2 = dot(coord, coord);
    if (r2 > 0.25) discard;
    float alpha = vColor.a * exp(-r2 * 11.5) * 0.96;
    if (alpha < 0.03) discard;
    vec3 lit = applyRoomSunlight(vWorldPos, vec3(0.0, 1.0, 0.0), vColor.rgb);
    gl_FragColor = vec4(lit, alpha);
  }
`;

const SURFEL_VERTEX_SHADER = `
  attribute vec3 iPos;
  attribute vec3 iScale;
  attribute vec4 iColor;
  attribute vec4 iQuat;

  uniform float uPointScale;
  uniform float uClipY;

  varying vec4 vColor;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;
  varying float vClipped;

  vec3 rotateQuat(vec3 v, vec4 q) {
    vec3 u = q.yzw;
    float s = q.x;
    return v + 2.0 * cross(u, cross(u, v) + s * v);
  }

  void main() {
    vColor = iColor;
    vUv = position.xy * 2.0;
    if (iPos.y > uClipY) {
      vClipped = 1.0;
      vWorldPos = iPos;
      vWorldNorm = vec3(0.0, 1.0, 0.0);
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vClipped = 0.0;
    float scaleMult = clamp(uPointScale * 0.94, 0.55, 2.5);
    vec3 localOffset = vec3(position.xy * iScale.xy * scaleMult, 0.0);
    vec3 worldPos = iPos + rotateQuat(localOffset, iQuat);
    vWorldPos = worldPos;
    vWorldNorm = normalize(rotateQuat(vec3(0.0, 0.0, 1.0), iQuat));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`;

const SURFEL_FRAGMENT_SHADER = `
  varying vec4 vColor;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;
  varying float vClipped;
  ${SUNLIGHT_GLSL}

  void main() {
    if (vClipped > 0.5) discard;
    float r2 = dot(vUv, vUv);
    float box = max(abs(vUv.x), abs(vUv.y));
    float d = mix(r2, box * box, 0.65);
    if (d > 1.0) discard;
    float alpha = vColor.a * exp(-d * 1.15);
    if (alpha < 0.32) discard;
    vec3 lit = applyRoomSunlight(vWorldPos, vWorldNorm, vColor.rgb);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

const MESH_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute vec2 aQuadUv;
  varying vec3 vColor;
  varying vec3 vNorm;
  varying vec2 vQuadUv;
  varying float vWorldY;
  varying vec3 vWorldPos;

  void main() {
    vColor = aColor;
    vNorm = normal;
    vQuadUv = aQuadUv;
    vWorldY = position.y;
    vWorldPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MESH_FRAGMENT_SHADER = `
  uniform float uClipY;
  varying vec3 vColor;
  varying vec3 vNorm;
  varying vec2 vQuadUv;
  varying float vWorldY;
  varying vec3 vWorldPos;
  ${SUNLIGHT_GLSL}

  void main() {
    if (vWorldY > uClipY) discard;
    vec3 surfaceCol = applyRoomSunlight(vWorldPos, vNorm, vColor);
    float edge = min(min(vQuadUv.x, 1.0 - vQuadUv.x), min(vQuadUv.y, 1.0 - vQuadUv.y));
    float grid = 1.0 - smoothstep(0.0, 0.075, edge);
    vec3 edgeCol = mix(surfaceCol * 0.62, vec3(0.18, 0.24, 0.34), 0.35);
    gl_FragColor = vec4(mix(surfaceCol, edgeCol, grid * 0.48), 1.0);
  }
`;

const LINE_VERTEX_SHADER = `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vWorldY;

  void main() {
    vColor = aColor;
    vWorldY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LINE_FRAGMENT_SHADER = `
  uniform float uClipY;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vWorldY;

  void main() {
    if (vWorldY > uClipY) discard;
    gl_FragColor = vec4(vColor, uOpacity);
  }
`;

const SHARP_POINT_VERTEX_SHADER = `
  attribute vec4 aColor;
  uniform float uClipY;
  uniform float uViewportHeight;
  varying vec4 vColor;
  varying float vClipped;

  void main() {
    vColor = aColor;
    if (position.y > uClipY) {
      vClipped = 1.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vClipped = 0.0;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(0.45, -mvPosition.z);
    gl_PointSize = clamp((0.008 * uViewportHeight) / dist, 1.8, 4.5);
  }
`;

const SHARP_POINT_FRAGMENT_SHADER = `
  varying vec4 vColor;
  varying float vClipped;

  void main() {
    if (vClipped > 0.5) discard;
    gl_FragColor = vec4(vColor.rgb, 0.92);
  }
`;

export default function VolumetricRoomViewer({
  room,
  apiBaseUrl,
  compact = false,
  syncedCamera = null,
  onCameraSyncChange,
  onAddPin,
  onUpdateFurnitures,
  onUpdateRoom,
}: Props) {
  const {
    params: sunParams,
    dayOfYear,
    sunState,
    playing: sunPlaying,
    togglePlay: toggleSunPlay,
    updateParams: updateSunParams,
  } = useSunlightState(room, true);
  const sunStateRef = useRef(sunState);
  sunStateRef.current = sunState;
  const sunEnabledRef = useRef(sunParams.enabled);
  sunEnabledRef.current = sunParams.enabled;
  const dayOfYearRef = useRef(dayOfYear);
  dayOfYearRef.current = dayOfYear;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sunGroupRef = useRef<THREE.Group | null>(null);
  const splatRef = useRef<ParsedSplatData | null>(null);
  const orientedRef = useRef<ParsedSplatData | null>(null);
  const surfaceCacheRef = useRef<ReconstructedSurfaceResult | null>(null);
  const matListRef = useRef<THREE.ShaderMaterial[]>([]);
  const sceneLayersRef = useRef<{
    scene: THREE.Scene;
    surfelMesh: THREE.Mesh;
    blobMesh: THREE.Points;
    surfaceMesh: THREE.Mesh | null;
    creaseLines: THREE.LineSegments | null;
    wireLines: THREE.LineSegments | null;
    sharpPoints: THREE.Points | null;
    hasDropIn: boolean;
    disposables: Array<{ dispose: () => void }>;
  } | null>(null);
  const camRef = useRef<THREE.PerspectiveCamera | null>(null);
  const markersRef = useRef<THREE.Group | null>(null);
  const furnGroupRef = useRef<THREE.Group | null>(null);
  const tcRef = useRef<TransformControls | null>(null);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const gizmoDraggingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [splatCount, setSplatCount] = useState(room.splatCount || 0);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [renderMode, setRenderMode] = useState<SplatRenderMode>("surfel");
  const [clipY, setClipY] = useState(1.1);
  const [pointScale, setPointScale] = useState(1.55);
  const [useAnisotropic3DGS, setUseAnisotropic3DGS] = useState(false);

  const clipYRef = useRef(clipY);
  clipYRef.current = clipY;
  const pointScaleRef = useRef(pointScale);
  pointScaleRef.current = pointScale;
  const renderModeRef = useRef<SplatRenderMode>(renderMode);
  renderModeRef.current = renderMode;

  const [tool, setTool] = useState<ToolMode>("none");
  const [measurePts, setMeasurePts] = useState<THREE.Vector3[]>([]);
  const [pendingPin, setPendingPin] = useState<[number, number, number] | null>(null);
  const [projectedPins, setProjectedPins] = useState<
    Array<{ pin: RoomPin; x: number; y: number; visible: boolean }>
  >([]);

  const [furnitures, setFurnitures] = useState<FurnitureItem[]>(room.furnitures || []);
  const [selectedFurnId, setSelectedFurnId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");
  const furnRef = useRef(furnitures);
  furnRef.current = furnitures;

  useEffect(() => {
    setFurnitures(room.furnitures || []);
  }, [room.id, room.furnitures]);

  const orbitRef = useRef({
    theta: 0.55,
    phi: 0.92,
    radius: 5.6,
    target: new THREE.Vector3(0, -0.25, 0),
    fpsPos: new THREE.Vector3(0, -0.22, 1.25),
    fpsYaw: 0,
    fpsPitch: -0.05,
  });
  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    orientedRef.current = null;
    surfaceCacheRef.current = null;
    (async () => {
      setLoading(true);
      try {
        const local = await loadLocalSplatBuffer(room.id).catch(() => null);
        if (local && !cancelled) {
          const parsed = parseSplatArrayBuffer(local);
          if (parsed.count > 0) {
            splatRef.current = parsed;
            setSplatCount(parsed.count);
            setLoading(false);
            return;
          }
        }
        if (room.splatUrl && !room.splatUrl.startsWith("local://")) {
          const url = room.splatUrl.startsWith("http") ? room.splatUrl : `${apiBaseUrl}${room.splatUrl}`;
          const res = await fetch(url);
          if (res.ok) {
            const parsed = parseSplatArrayBuffer(await res.arrayBuffer());
            if (!cancelled && parsed.count > 0) {
              splatRef.current = parsed;
              setSplatCount(parsed.count);
              setLoading(false);
              return;
            }
          }
        }
      } catch {}
      if (!cancelled) {
        const preset = room.localSplatPreset || (room.id.includes("yeonnam") ? "yeonnam" : "yeoksam");
        const fallback = generateSampleRoomSplatData(preset);
        splatRef.current = fallback;
        setSplatCount(fallback.count);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room.id, room.splatUrl, room.localSplatPreset, apiBaseUrl]);

  useEffect(() => {
    if (!syncedCamera) return;
    orbitRef.current.theta = syncedCamera.theta;
    orbitRef.current.phi = syncedCamera.phi;
    orbitRef.current.radius = syncedCamera.radius;
    orbitRef.current.target.set(...syncedCamera.target);
  }, [syncedCamera]);

  const switchMode = useCallback((mode: CameraMode) => {
    setCameraMode(mode);
    if (mode === "dollhouse") {
      orbitRef.current.phi = 0.42;
      orbitRef.current.radius = 6.8;
      orbitRef.current.target.set(0, -0.35, 0);
      setClipY(0.68);
    } else if (mode === "walkthrough") {
      orbitRef.current.fpsPos.set(0, -0.22, 1.25);
      orbitRef.current.fpsYaw = 0;
      orbitRef.current.fpsPitch = -0.05;
      setClipY(1.35);
    } else {
      orbitRef.current.phi = 0.92;
      orbitRef.current.radius = 5.6;
      orbitRef.current.target.set(0, -0.25, 0);
      setClipY(1.0);
    }
  }, []);

  const pickPoint = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 | null => {
      const container = containerRef.current;
      const camera = camRef.current;
      const data = splatRef.current;
      if (!container || !camera || !data) return null;

      const rect = container.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const ray = raycaster.ray;

      let bestDistSq = Infinity;
      let best: THREE.Vector3 | null = null;
      const tmp = new THREE.Vector3();
      const step = Math.max(1, Math.floor(data.count / 18000));

      for (let i = 0; i < data.count; i += step) {
        const py = data.positions[i * 3 + 1];
        if (py > clipY) continue;
        tmp.set(data.positions[i * 3], py, data.positions[i * 3 + 2]);
        const d2 = ray.distanceSqToPoint(tmp);
        if (d2 < 0.045 && d2 < bestDistSq) {
          bestDistSq = d2;
          best = tmp.clone();
        }
      }
      return best;
    },
    [clipY]
  );

  useEffect(() => {
    const container = containerRef.current;
    const data = splatRef.current;
    if (!container || !data || loading) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111318");

    const grid = new THREE.GridHelper(10, 20, "#262b36", "#1a1e26");
    grid.position.y = -1.28;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(56, w / h, 0.1, 60);
    camRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.replaceChildren(renderer.domElement);

    // @mkkellogg/gaussian-splats-3d DropInViewer (타원 정렬 3DGS 모드 선택 시)
    let dropInViewer: any = null;
    if (useAnisotropic3DGS && room.splatUrl) {
      try {
        dropInViewer = new GaussianSplats3D.DropInViewer({
          gpuAcceleratedSort: false,
          sharedMemoryForWorkers: false,
        });
        const fullUrl = room.splatUrl.startsWith("http")
          ? room.splatUrl
          : `${apiBaseUrl}${room.splatUrl}`;
        dropInViewer.addSplatScenes([{ path: fullUrl, splatAlphaRemovalThreshold: 5 }], false);
        scene.add(dropInViewer);
      } catch {
        dropInViewer = null;
      }
    }

    const oriented = orientedRef.current ?? ensureOrientedSurfels(data);
    orientedRef.current = oriented;

    const disposables: Array<{ dispose: () => void }> = [];
    const mats: THREE.ShaderMaterial[] = [];

    // 1) 2DGS Oriented Surfel (기본 면 렌더링: 구/공 대신 접평면 디스크 타일링)
    const quadPos = new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0,
    ]);
    const quadIdx = [0, 1, 2, 0, 2, 3];
    const surfelGeo = new THREE.InstancedBufferGeometry();
    surfelGeo.setAttribute("position", new THREE.BufferAttribute(quadPos, 3));
    surfelGeo.setIndex(quadIdx);
    surfelGeo.setAttribute("iPos", new THREE.InstancedBufferAttribute(oriented.positions, 3));
    surfelGeo.setAttribute("iScale", new THREE.InstancedBufferAttribute(oriented.scales, 3));
    surfelGeo.setAttribute("iColor", new THREE.InstancedBufferAttribute(oriented.colors, 4));
    surfelGeo.setAttribute("iQuat", new THREE.InstancedBufferAttribute(oriented.quats, 4));
    surfelGeo.instanceCount = oriented.count;

    const surfelMat = new THREE.ShaderMaterial({
      vertexShader: SURFEL_VERTEX_SHADER,
      fragmentShader: SURFEL_FRAGMENT_SHADER,
      uniforms: {
        uPointScale: { value: pointScaleRef.current },
        uClipY: { value: clipYRef.current },
        ...createSunUniforms(sunStateRef.current, sunEnabledRef.current),
      },
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });
    const surfelMesh = new THREE.Mesh(surfelGeo, surfelMat);
    surfelMesh.frustumCulled = false;
    scene.add(surfelMesh);
    disposables.push(surfelGeo, surfelMat);
    mats.push(surfelMat);

    // 2) Legacy Spherical Blob 3DGS (비교용 기존 구 형태 셰이더)
    const blobGeo = new THREE.BufferGeometry();
    blobGeo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    blobGeo.setAttribute("aScale", new THREE.BufferAttribute(data.scales, 3));
    blobGeo.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 4));

    const blobMat = new THREE.ShaderMaterial({
      vertexShader: BLOB_VERTEX_SHADER,
      fragmentShader: BLOB_FRAGMENT_SHADER,
      uniforms: {
        uPointScale: { value: pointScaleRef.current },
        uViewportHeight: { value: h * renderer.getPixelRatio() },
        uClipY: { value: clipYRef.current },
        ...createSunUniforms(sunStateRef.current, sunEnabledRef.current),
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });
    const blobMesh = new THREE.Points(blobGeo, blobMat);
    blobMesh.frustumCulled = false;
    scene.add(blobMesh);
    disposables.push(blobGeo, blobMat);
    mats.push(blobMat);

    const sunGroup = new THREE.Group();
    scene.add(sunGroup);
    sunGroupRef.current = sunGroup;
    updateSunOverlayGroup(sunGroup, room, sunStateRef.current, {
      dayOfYear: dayOfYearRef.current,
      floorY: FLOOR_Y,
      clipY: clipYRef.current,
      enabled: sunEnabledRef.current,
    });

    matListRef.current = mats;
    sceneLayersRef.current = {
      scene,
      surfelMesh,
      blobMesh,
      surfaceMesh: null,
      creaseLines: null,
      wireLines: null,
      sharpPoints: null,
      hasDropIn: Boolean(dropInViewer),
      disposables,
    };

    const markers = new THREE.Group();
    const furnGroup = new THREE.Group();
    scene.add(markers);
    scene.add(furnGroup);
    markersRef.current = markers;
    furnGroupRef.current = furnGroup;

    // TransformControls (3D 가구 배치 이동/회전 기즈모)
    const tc = new TransformControls(camera, renderer.domElement);
    tc.addEventListener("dragging-changed", (ev) => {
      gizmoDraggingRef.current = Boolean(ev.value);
      if (!ev.value && tc.object) {
        const fid = tc.object.userData.furnitureId as string | undefined;
        if (fid) {
          const pos = tc.object.position;
          const rotY = tc.object.rotation.y;
          const next = furnRef.current.map((f) =>
            f.id === fid
              ? {
                  ...f,
                  position: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)] as [
                    number,
                    number,
                    number,
                  ],
                  rotationY: +rotY.toFixed(3),
                }
              : f
          );
          setFurnitures(next);
          onUpdateFurnitures?.(next);
        }
      }
    });
    scene.add(tc.getHelper());
    tcRef.current = tc;

    let dragging = false;
    let sx = 0;
    let sy = 0;
    let pinchDist = 0;
    const dom = renderer.domElement;

    const emitSync = () =>
      onCameraSyncChange?.({
        theta: orbitRef.current.theta,
        phi: orbitRef.current.phi,
        radius: orbitRef.current.radius,
        target: [orbitRef.current.target.x, orbitRef.current.target.y, orbitRef.current.target.z],
      });

    const onDown = (e: PointerEvent) => {
      if (gizmoDraggingRef.current) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || gizmoDraggingRef.current) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      sx = e.clientX;
      sy = e.clientY;

      if (cameraMode === "walkthrough") {
        orbitRef.current.fpsYaw -= dx * 0.0055;
        orbitRef.current.fpsPitch = Math.max(-1.1, Math.min(1.1, orbitRef.current.fpsPitch - dy * 0.0055));
      } else {
        orbitRef.current.theta -= dx * 0.007;
        orbitRef.current.phi = Math.max(0.15, Math.min(Math.PI * 0.49, orbitRef.current.phi - dy * 0.007));
        emitSync();
      }
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.radius = Math.max(1.4, Math.min(14, orbitRef.current.radius + e.deltaY * 0.004));
      emitSync();
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist > 0) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        orbitRef.current.radius = Math.max(1.5, Math.min(14, orbitRef.current.radius + (pinchDist - d) * 0.015));
        pinchDist = d;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => (keysRef.current[e.key.toLowerCase()] = true);
    const onKeyUp = (e: KeyboardEvent) => (keysRef.current[e.key.toLowerCase()] = false);
    const onResize = () => {
      const cw = container.clientWidth || 800;
      const ch = container.clientHeight || 520;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
      const vh = ch * renderer.getPixelRatio();
      for (const m of matListRef.current) {
        if (m.uniforms.uViewportHeight) m.uniforms.uViewportHeight.value = vh;
      }
    };

    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("touchstart", onTouchStart, { passive: true });
    dom.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);

    let raf = 0;
    let tick = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (cameraMode === "walkthrough") {
        const yaw = orbitRef.current.fpsYaw;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        if (keysRef.current["w"] || keysRef.current["arrowup"]) orbitRef.current.fpsPos.addScaledVector(fwd, 0.045);
        if (keysRef.current["s"] || keysRef.current["arrowdown"]) orbitRef.current.fpsPos.addScaledVector(fwd, -0.045);
        if (keysRef.current["a"] || keysRef.current["arrowleft"]) orbitRef.current.fpsPos.addScaledVector(right, -0.045);
        if (keysRef.current["d"] || keysRef.current["arrowright"]) orbitRef.current.fpsPos.addScaledVector(right, 0.045);

        camera.position.copy(orbitRef.current.fpsPos);
        const dir = new THREE.Vector3(
          -Math.sin(yaw) * Math.cos(orbitRef.current.fpsPitch),
          Math.sin(orbitRef.current.fpsPitch),
          -Math.cos(yaw) * Math.cos(orbitRef.current.fpsPitch)
        );
        camera.lookAt(camera.position.clone().add(dir));
      } else {
        const { theta, phi, radius, target } = orbitRef.current;
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.cos(theta)
        );
        camera.lookAt(target);
      }
      renderer.render(scene, camera);

      if (++tick % 3 === 0) {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        const activeClipY = clipYRef.current;
        setProjectedPins(
          (room.pins || []).map((pin) => {
            const v = new THREE.Vector3(...pin.position).project(camera);
            return {
              pin,
              x: (v.x * 0.5 + 0.5) * cw,
              y: (-v.y * 0.5 + 0.5) * ch,
              visible: v.z >= -1 && v.z <= 1 && pin.position[1] <= activeClipY,
            };
          })
        );
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("touchstart", onTouchStart);
      dom.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      tc.dispose();
      const layerCleanup = sceneLayersRef.current;
      if (layerCleanup) {
        for (const item of layerCleanup.disposables) item.dispose();
      }
      if (sunGroupRef.current) {
        disposeGroupChildren(sunGroupRef.current);
        sunGroupRef.current = null;
      }
      sceneLayersRef.current = null;
      matListRef.current = [];
      renderer.dispose();
    };
  }, [loading, cameraMode, room.id, room.pins, useAnisotropic3DGS, apiBaseUrl, room.splatUrl]);

  useEffect(() => {
    const layers = sceneLayersRef.current;
    const oriented = orientedRef.current;
    if (!layers || !oriented || loading) return;

    const active = !layers.hasDropIn;
    if ((renderMode === "mesh" || renderMode === "wire") && !layers.surfaceMesh) {
      const surface = surfaceCacheRef.current ?? reconstructSurfaceMeshAndLines(oriented);
      surfaceCacheRef.current = surface;

      const vh = (containerRef.current?.clientHeight || 520) * Math.min(window.devicePixelRatio || 1, 2);

      // 폴리곤 삼각형 면 (Manifold Quad Surface + Quad Grid Shader)
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute("position", new THREE.BufferAttribute(surface.meshPositions, 3));
      meshGeo.setAttribute("normal", new THREE.BufferAttribute(surface.meshNormals, 3));
      meshGeo.setAttribute("aColor", new THREE.BufferAttribute(surface.meshColors, 3));
      meshGeo.setAttribute("aQuadUv", new THREE.BufferAttribute(surface.meshQuadUvs, 2));
      const meshMat = new THREE.ShaderMaterial({
        vertexShader: MESH_VERTEX_SHADER,
        fragmentShader: MESH_FRAGMENT_SHADER,
        uniforms: {
          uClipY: { value: clipYRef.current },
          ...createSunUniforms(sunStateRef.current, sunEnabledRef.current),
        },
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
      });
      const surfaceMesh = new THREE.Mesh(meshGeo, meshMat);
      surfaceMesh.frustumCulled = false;
      layers.scene.add(surfaceMesh);
      layers.surfaceMesh = surfaceMesh;
      layers.disposables.push(meshGeo, meshMat);
      matListRef.current.push(meshMat);

      // 구조 엣지/크리즈 선 (벽-바닥 교차선 및 가구 모서리)
      const creaseGeo = new THREE.BufferGeometry();
      creaseGeo.setAttribute("position", new THREE.BufferAttribute(surface.creasePositions, 3));
      creaseGeo.setAttribute("aColor", new THREE.BufferAttribute(surface.creaseColors, 3));
      const creaseMat = new THREE.ShaderMaterial({
        vertexShader: LINE_VERTEX_SHADER,
        fragmentShader: LINE_FRAGMENT_SHADER,
        uniforms: { uClipY: { value: clipYRef.current }, uOpacity: { value: 0.92 } },
        transparent: true,
      });
      const creaseLines = new THREE.LineSegments(creaseGeo, creaseMat);
      creaseLines.frustumCulled = false;
      layers.scene.add(creaseLines);
      layers.creaseLines = creaseLines;
      layers.disposables.push(creaseGeo, creaseMat);
      matListRef.current.push(creaseMat);

      // 전체 복셀 격자 와이어프레임 선
      const wireGeo = new THREE.BufferGeometry();
      wireGeo.setAttribute("position", new THREE.BufferAttribute(surface.wirePositions, 3));
      wireGeo.setAttribute("aColor", new THREE.BufferAttribute(surface.wireColors, 3));
      const wireMat = new THREE.ShaderMaterial({
        vertexShader: LINE_VERTEX_SHADER,
        fragmentShader: LINE_FRAGMENT_SHADER,
        uniforms: { uClipY: { value: clipYRef.current }, uOpacity: { value: 0.58 } },
        transparent: true,
      });
      const wireLines = new THREE.LineSegments(wireGeo, wireMat);
      wireLines.frustumCulled = false;
      layers.scene.add(wireLines);
      layers.wireLines = wireLines;
      layers.disposables.push(wireGeo, wireMat);
      matListRef.current.push(wireMat);

      // 선명한 꼭짓점 포인트 (점+선 모드용)
      const ptGeo = new THREE.BufferGeometry();
      ptGeo.setAttribute("position", new THREE.BufferAttribute(oriented.positions, 3));
      ptGeo.setAttribute("aColor", new THREE.BufferAttribute(oriented.colors, 4));
      const ptMat = new THREE.ShaderMaterial({
        vertexShader: SHARP_POINT_VERTEX_SHADER,
        fragmentShader: SHARP_POINT_FRAGMENT_SHADER,
        uniforms: {
          uClipY: { value: clipYRef.current },
          uViewportHeight: { value: vh },
        },
        transparent: true,
      });
      const sharpPoints = new THREE.Points(ptGeo, ptMat);
      sharpPoints.frustumCulled = false;
      layers.scene.add(sharpPoints);
      layers.sharpPoints = sharpPoints;
      layers.disposables.push(ptGeo, ptMat);
      matListRef.current.push(ptMat);
    }

    const hasMeshTriangles = (surfaceCacheRef.current?.triangleCount ?? 0) > 0;
    layers.surfelMesh.visible =
      active && (renderMode === "surfel" || (renderMode === "mesh" && !hasMeshTriangles));
    if (layers.surfaceMesh) layers.surfaceMesh.visible = active && renderMode === "mesh" && hasMeshTriangles;
    if (layers.creaseLines) layers.creaseLines.visible = active && (renderMode === "mesh" || renderMode === "wire");
    if (layers.wireLines) layers.wireLines.visible = active && renderMode === "wire";
    if (layers.sharpPoints) layers.sharpPoints.visible = active && renderMode === "wire";
    layers.blobMesh.visible = active && renderMode === "blob";
  }, [renderMode, useAnisotropic3DGS, loading]);

  useEffect(() => {
    for (const m of matListRef.current) {
      if (m.uniforms.uClipY) m.uniforms.uClipY.value = clipY;
      if (m.uniforms.uPointScale) m.uniforms.uPointScale.value = pointScale;
    }
    if (sunGroupRef.current) {
      sunGroupRef.current.traverse((obj) => {
        const sm = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (sm && sm.uniforms?.uClipY) sm.uniforms.uClipY.value = clipY;
      });
    }
  }, [clipY, pointScale]);

  useEffect(() => {
    for (const m of matListRef.current) {
      syncMaterialSunUniforms(m, sunState, sunParams.enabled);
    }
    if (sunGroupRef.current) {
      updateSunOverlayGroup(sunGroupRef.current, room, sunState, {
        dayOfYear,
        floorY: FLOOR_Y,
        clipY: clipYRef.current,
        enabled: sunParams.enabled,
      });
    }
  }, [sunState, sunParams.enabled, dayOfYear, room, loading]);

  // 3D 가구 메시 및 TransformControls 기즈모 동기화
  useEffect(() => {
    const fg = furnGroupRef.current;
    const tc = tcRef.current;
    if (!fg || !tc) return;
    tc.detach();
    meshMapRef.current = buildFurnitureGroup(fg, furnitures, selectedFurnId);
    if (tool === "furniture" && selectedFurnId) {
      const targetMesh = meshMapRef.current.get(selectedFurnId);
      if (targetMesh) {
        tc.setMode(gizmoMode);
        tc.showY = gizmoMode === "rotate";
        tc.showX = gizmoMode === "translate";
        tc.showZ = gizmoMode === "translate";
        tc.attach(targetMesh);
      }
    }
  }, [furnitures, selectedFurnId, tool, gizmoMode, loading]);

  useEffect(() => {
    const g = markersRef.current;
    if (!g) return;
    g.clear();
    const dot = new THREE.MeshBasicMaterial({ color: "#b93800", depthTest: false });
    for (const p of measurePts) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05), dot);
      m.position.copy(p);
      g.add(m);
    }
    if (measurePts.length === 2) {
      g.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(measurePts),
          new THREE.LineBasicMaterial({ color: "#b93800" })
        )
      );
    }
  }, [measurePts]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool === "none" || tool === "sun" || gizmoDraggingRef.current) return;
    if (tool === "furniture") {
      const container = containerRef.current;
      const camera = camRef.current;
      const fg = furnGroupRef.current;
      if (!container || !camera || !fg) return;
      const rect = container.getBoundingClientRect();
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        ),
        camera
      );
      const hits = raycaster.intersectObjects(fg.children, false);
      if (hits.length > 0) {
        setSelectedFurnId(hits[0].object.userData.furnitureId as string);
      }
      return;
    }

    const pt = pickPoint(e.clientX, e.clientY);
    if (!pt) return;
    if (tool === "measure") {
      setMeasurePts((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
    } else if (tool === "pin") {
      setPendingPin([+pt.x.toFixed(2), +pt.y.toFixed(2), +pt.z.toFixed(2)]);
    }
  };

  const toggleTool = (t: Exclude<ToolMode, "none">) => {
    setTool((cur) => (cur === t ? "none" : t));
    setMeasurePts([]);
    setPendingPin(null);
    if (t !== "furniture") setSelectedFurnId(null);
  };

  const downloadSplat = () => {
    if (!splatRef.current) return;
    const blob = new Blob([encodeSplatArrayBuffer(splatRef.current)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.id}.splat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stepWalk = (fwdDelta: number, rightDelta: number) => {
    const yaw = orbitRef.current.fpsYaw;
    orbitRef.current.fpsPos.addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), fwdDelta);
    orbitRef.current.fpsPos.addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), rightDelta);
  };

  return (
    <div className="relative flex h-full min-h-[340px] w-full select-none flex-col overflow-hidden border border-ink bg-stage">
      {/* 상단 툴바 */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2">
        <div className="vbar pointer-events-auto">
          <button onClick={() => switchMode("orbit")} className={`vbtn ${cameraMode === "orbit" ? "vbtn-on" : ""}`}>
            <Compass className="h-3.5 w-3.5" /> 회전
          </button>
          <button
            onClick={() => switchMode("dollhouse")}
            className={`vbtn ${cameraMode === "dollhouse" ? "vbtn-on" : ""}`}
          >
            <Layers className="h-3.5 w-3.5" /> 단면
          </button>
          <button
            onClick={() => switchMode("walkthrough")}
            className={`vbtn ${cameraMode === "walkthrough" ? "vbtn-on" : ""}`}
          >
            <Footprints className="h-3.5 w-3.5" /> 1인칭
          </button>
        </div>

        <div className="vbar pointer-events-auto">
          {(
            [
              { id: "surfel", label: "면 2D", icon: Shapes, title: "2DGS 접평면 Surfel (구/공 형태 제거)" },
              { id: "mesh", label: "선+면", icon: Grid3X3, title: "복셀 매니폴드 면 + 건축 구조선 (Mesh)" },
              { id: "wire", label: "점+선", icon: Waypoints, title: "꼭짓점 + 크리즈/격자 선 (Wireframe)" },
              { id: "blob", label: "공(비교)", icon: Sparkles, title: "기존 등방성 구(공) 3DGS 비교" },
            ] as const
          ).map(({ id, label, icon: Icon, title }) => (
            <button
              key={id}
              onClick={() => {
                setUseAnisotropic3DGS(false);
                setRenderMode(id);
              }}
              className={`vbtn ${!useAnisotropic3DGS && renderMode === id ? "vbtn-on" : ""}`}
              title={title}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {!compact && (
          <div className="vbar pointer-events-auto">
            <button onClick={() => toggleTool("sun")} className={`vbtn ${tool === "sun" ? "vbtn-on" : ""}`}>
              <Sun className="h-3.5 w-3.5" /> 채광
            </button>
            <button onClick={() => toggleTool("measure")} className={`vbtn ${tool === "measure" ? "vbtn-on" : ""}`}>
              <Ruler className="h-3.5 w-3.5" /> 치수
            </button>
            <button onClick={() => toggleTool("pin")} className={`vbtn ${tool === "pin" ? "vbtn-on" : ""}`}>
              <MapPin className="h-3.5 w-3.5" /> 핀
            </button>
            <button
              onClick={() => toggleTool("furniture")}
              className={`vbtn ${tool === "furniture" ? "vbtn-on" : ""}`}
            >
              <Box className="h-3.5 w-3.5" /> 가구 배치 ({furnitures.length})
            </button>
            <button
              onClick={() => setUseAnisotropic3DGS((v) => !v)}
              className={`vbtn hidden sm:flex ${useAnisotropic3DGS ? "vbtn-on" : ""}`}
              title="@mkkellogg/gaussian-splats-3d 타원 정렬 렌더러 전환"
            >
              3DGS 정렬
            </button>
            <button onClick={downloadSplat} className="vbtn" title=".splat 다운로드">
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {tool === "sun" && (
        <div className="pointer-events-none absolute bottom-12 left-3 right-3 z-20">
          <SunlightControlBar
            params={sunParams}
            sunState={sunState}
            direction={room.direction}
            playing={sunPlaying}
            onChangeParams={updateSunParams}
            onTogglePlay={toggleSunPlay}
            onUpdateRoomLocationAndDirection={(patch) => onUpdateRoom?.(patch)}
            onClose={() => setTool("none")}
          />
        </div>
      )}

      {tool === "measure" && (
        <MeasureBanner
          distance={measurePts.length === 2 ? measurePts[0].distanceTo(measurePts[1]) : null}
          hasStart={measurePts.length === 1}
        />
      )}
      {tool === "pin" && (
        <PinPrompt
          position={pendingPin}
          onSave={(pin) => {
            onAddPin?.(pin);
            setPendingPin(null);
            setTool("none");
          }}
        />
      )}
      {tool === "furniture" && (
        <FurniturePaletteBar
          furnitures={furnitures}
          selectedId={selectedFurnId}
          gizmoMode={gizmoMode}
          onChangeGizmoMode={setGizmoMode}
          onSelect={setSelectedFurnId}
          onAdd={(item) => {
            const next = [...furnitures, item];
            setFurnitures(next);
            onUpdateFurnitures?.(next);
          }}
          onDelete={(id) => {
            const next = furnitures.filter((f) => f.id !== id);
            setFurnitures(next);
            setSelectedFurnId(null);
            onUpdateFurnitures?.(next);
          }}
        />
      )}

      <div
        ref={containerRef}
        onClick={handleClick}
        className={`min-h-[340px] w-full flex-1 ${
          tool !== "none" && tool !== "sun" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        }`}
      />

      <PinLabels
        pins={projectedPins}
        onFocus={(pin) => {
          orbitRef.current.target.set(...pin.position);
          orbitRef.current.radius = 3.2;
        }}
      />

      {cameraMode === "walkthrough" && (
        <div className="vbar absolute bottom-12 left-1/2 z-20 -translate-x-1/2">
          <button onClick={() => stepWalk(0, -0.35)} className="vbtn">
            좌
          </button>
          <button onClick={() => stepWalk(0.4, 0)} className="vbtn vbtn-on">
            앞으로
          </button>
          <button onClick={() => stepWalk(-0.4, 0)} className="vbtn">
            뒤로
          </button>
          <button onClick={() => stepWalk(0, 0.35)} className="vbtn">
            우
          </button>
        </div>
      )}

      {/* 하단 상태 및 단면/밀도 슬라이더 */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <div className="vbar pointer-events-auto px-2.5 py-1 text-xs">
          <span className="num">{splatCount.toLocaleString()} pts</span>
          <span className="mx-1.5 opacity-40">·</span>
          <span>
            {useAnisotropic3DGS
              ? "3DGS 정렬"
              : renderMode === "surfel"
                ? "2D Surfel 면"
                : renderMode === "mesh"
                  ? "선+면 Mesh"
                  : renderMode === "wire"
                    ? "점+선 Wire"
                    : "기존 공 3DGS"}
          </span>
          {!compact && (
            <>
              <span className="mx-1.5 opacity-40">·</span>
              <button
                type="button"
                onClick={() => toggleTool("sun")}
                className="hover:text-amber-300"
                title="위치·방위 기반 채광 설정 열기"
              >
                {sunState.location.label} · {room.direction || "남향"} ·{" "}
                {sunState.isDirectSunlight ? "직사광" : "간접광"}
              </button>
            </>
          )}
          <span className="mx-1.5 opacity-40 hidden sm:inline">·</span>
          <span className="hidden sm:inline">{engineLabel(room.engine)}</span>
        </div>

        <div className="vbar pointer-events-auto gap-3 px-2.5 py-1 text-xs">
          <label className="flex items-center gap-1.5">
            <span>단면</span>
            <input
              type="range"
              min="-0.6"
              max="1.35"
              step="0.05"
              value={clipY}
              onChange={(e) => setClipY(parseFloat(e.target.value))}
              className="w-16 accent-accent"
            />
          </label>
          {!compact && (
            <label className="hidden items-center gap-1.5 sm:flex">
              <span>밀도</span>
              <input
                type="range"
                min="0.7"
                max="2.6"
                step="0.05"
                value={pointScale}
                onChange={(e) => setPointScale(parseFloat(e.target.value))}
                className="w-16 accent-accent"
              />
            </label>
          )}
        </div>
      </div>

      {loading && <ViewerLoading text="3D 공간 불러오는 중…" />}
    </div>
  );
}
