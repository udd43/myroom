"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box, MapPin, Ruler, Sun } from "lucide-react";
import { FurnitureItem, RoomItem, RoomPin } from "@/types/room";
import { disposeGroupChildren, updateSunOverlayGroup } from "@/lib/sunScene3d";
import { useSunlightState } from "@/hooks/useSunlightState";
import { MeasureBanner, PinLabels, PinPrompt, ViewerLoading } from "./ViewerOverlays";
import { FurniturePaletteBar, buildFurnitureGroup } from "./FurnitureControls";
import SunlightControlBar from "./SunlightControlBar";

interface Props {
  room: RoomItem;
  apiBaseUrl: string;
  onAddPin?: (pin: Omit<RoomPin, "id">) => void;
  onUpdateFurnitures?: (items: FurnitureItem[]) => void;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
}

type Mode = "none" | "measure" | "pin" | "furniture" | "sun";
type Projected = Array<{ pin: RoomPin; x: number; y: number; visible: boolean }>;

/** LiDAR 스캔(GLB) 뷰어 + TransformControls 3D 가구 배치 */
export default function MeshRoomViewer({
  room,
  apiBaseUrl,
  onAddPin,
  onUpdateFurnitures,
  onUpdateRoom,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    clip: THREE.Plane;
    markers: THREE.Group;
    furnitureGroup: THREE.Group;
    tc: TransformControls;
    ambLight: THREE.AmbientLight;
    dirLight: THREE.DirectionalLight;
    sunOverlayGroup: THREE.Group;
  } | null>(null);
  const meshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const { params, dayOfYear, sunState, playing, togglePlay, updateParams } = useSunlightState(room, true);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [bounds, setBounds] = useState<{ min: number; max: number } | null>(null);
  const [clipY, setClipY] = useState(100);
  const [mode, setMode] = useState<Mode>("none");
  const [measure, setMeasure] = useState<THREE.Vector3[]>([]);
  const [pending, setPending] = useState<[number, number, number] | null>(null);
  const [projected, setProjected] = useState<Projected>([]);

  const [furnitures, setFurnitures] = useState<FurnitureItem[]>(room.furnitures || []);
  const [selectedFurnId, setSelectedFurnId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<"translate" | "rotate">("translate");

  const modeRef = useRef(mode);
  const pinsRef = useRef(room.pins);
  const furnRef = useRef(furnitures);
  modeRef.current = mode;
  pinsRef.current = room.pins;
  furnRef.current = furnitures;

  useEffect(() => {
    setFurnitures(room.furnitures || []);
  }, [room.id, room.furnitures]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !room.modelUrl) return;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111318");
    const ambLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 8, 4);
    scene.add(dirLight);
    const sunOverlayGroup = new THREE.Group();
    scene.add(sunOverlayGroup);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    container.replaceChildren(renderer.domElement);

    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
    const markers = new THREE.Group();
    const furnitureGroup = new THREE.Group();
    scene.add(markers);
    scene.add(furnitureGroup);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const tc = new TransformControls(camera, renderer.domElement);
    tc.addEventListener("dragging-changed", (ev) => {
      controls.enabled = !ev.value;
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
    sceneRef.current = { clip, markers, furnitureGroup, tc, ambLight, dirLight, sunOverlayGroup };

    const resize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 520;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    let root: THREE.Object3D | null = null;
    const url = room.modelUrl.startsWith("http") ? room.modelUrl : `${apiBaseUrl}${room.modelUrl}`;
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (disposed) return;
        root = gltf.scene;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            mat.side = THREE.DoubleSide;
            mat.clippingPlanes = [clip];
          }
        });
        scene.add(root);
        const box = new THREE.Box3().setFromObject(root);
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(...box.getSize(new THREE.Vector3()).toArray());
        controls.target.copy(c);
        camera.position.set(c.x + r * 0.7, box.max.y + r * 0.6, c.z + r * 0.9);
        setBounds({ min: box.min.y, max: box.max.y });
        setClipY(box.max.y + 1);
        setStatus("ready");
      },
      undefined,
      () => !disposed && setStatus("error")
    );

    const ray = new THREE.Raycaster();
    const dom = renderer.domElement;
    let down = [0, 0];
    const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const rect = dom.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        ),
        camera
      );

      if (modeRef.current === "furniture") {
        const fHits = ray.intersectObjects(furnitureGroup.children, false);
        if (fHits.length > 0) {
          const fid = fHits[0].object.userData.furnitureId as string;
          setSelectedFurnId(fid);
        }
        return;
      }

      if (modeRef.current === "none" || !root) return;
      const hit = ray.intersectObject(root, true).find((h) => clip.distanceToPoint(h.point) <= 0);
      if (!hit) return;
      const p = hit.point;
      if (modeRef.current === "measure") {
        setMeasure((prev) => (prev.length >= 2 ? [p.clone()] : [...prev, p.clone()]));
      } else if (modeRef.current === "pin") {
        setPending([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      }
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);

    let raf = 0;
    let tick = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
      if (++tick % 4) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      setProjected(
        pinsRef.current.map((pin) => {
          const v = new THREE.Vector3(...pin.position).project(camera);
          return {
            pin,
            x: (v.x * 0.5 + 0.5) * w,
            y: (-v.y * 0.5 + 0.5) * h,
            visible: v.z > -1 && v.z < 1 && pin.position[1] <= clip.constant,
          };
        })
      );
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", resize);
      disposeGroupChildren(sunOverlayGroup);
      tc.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, [room.modelUrl, apiBaseUrl]);

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.clip.constant = clipY;
  }, [clipY]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const floorY = bounds ? bounds.min : -1.25;
    if (params.enabled) {
      const [sx, sy, sz] = sunState.towardSunRoom;
      s.dirLight.position.set(sx * 10, Math.max(0.6, sy * 10), sz * 10);
      s.dirLight.color.setRGB(sunState.sunColor[0], sunState.sunColor[1], sunState.sunColor[2]);
      s.dirLight.intensity = sunState.isDirectSunlight
        ? 0.9 + sunState.directIntensity * 1.9
        : sunState.world.isDaylight
          ? 0.35
          : 0.12;
      s.ambLight.color.setRGB(sunState.skyColor[0], sunState.skyColor[1], sunState.skyColor[2]);
      s.ambLight.intensity = 0.8 + sunState.skyIntensity * 0.95;
    } else {
      s.ambLight.color.setHex(0xffffff);
      s.ambLight.intensity = 1.6;
      s.dirLight.color.setHex(0xffffff);
      s.dirLight.intensity = 1.2;
      s.dirLight.position.set(3, 8, 4);
    }
    updateSunOverlayGroup(s.sunOverlayGroup, room, sunState, {
      dayOfYear,
      floorY,
      clipY,
      enabled: params.enabled,
    });
  }, [room, sunState, params.enabled, dayOfYear, clipY, bounds, status]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.tc.detach();
    meshMapRef.current = buildFurnitureGroup(s.furnitureGroup, furnitures, selectedFurnId);
    if (mode === "furniture" && selectedFurnId) {
      const targetMesh = meshMapRef.current.get(selectedFurnId);
      if (targetMesh) {
        s.tc.setMode(gizmoMode);
        s.tc.showY = gizmoMode === "rotate";
        s.tc.showX = gizmoMode === "translate";
        s.tc.showZ = gizmoMode === "translate";
        s.tc.attach(targetMesh);
      }
    }
  }, [furnitures, selectedFurnId, mode, gizmoMode, status]);

  useEffect(() => {
    const g = sceneRef.current?.markers;
    if (!g) return;
    g.clear();
    const dot = new THREE.MeshBasicMaterial({ color: "#b93800", depthTest: false });
    for (const p of measure) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.04), dot);
      m.position.copy(p);
      m.renderOrder = 10;
      g.add(m);
    }
    if (measure.length === 2) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(measure),
        new THREE.LineBasicMaterial({ color: "#b93800", depthTest: false })
      );
      line.renderOrder = 10;
      g.add(line);
    }
  }, [measure]);

  const toggle = (m: Exclude<Mode, "none">) => {
    setMode((cur) => (cur === m ? "none" : m));
    setMeasure([]);
    setPending(null);
    if (m !== "furniture") setSelectedFurnId(null);
  };

  return (
    <div className="relative flex h-full min-h-[340px] w-full flex-col overflow-hidden border border-ink bg-stage">
      <div className="vbar absolute left-3 top-3 z-20">
        <button onClick={() => toggle("measure")} className={`vbtn ${mode === "measure" ? "vbtn-on" : ""}`}>
          <Ruler className="h-3.5 w-3.5" /> 치수
        </button>
        <button onClick={() => toggle("pin")} className={`vbtn ${mode === "pin" ? "vbtn-on" : ""}`}>
          <MapPin className="h-3.5 w-3.5" /> 핀
        </button>
        <button onClick={() => toggle("furniture")} className={`vbtn ${mode === "furniture" ? "vbtn-on" : ""}`}>
          <Box className="h-3.5 w-3.5" /> 가구 배치 ({furnitures.length})
        </button>
        <button onClick={() => toggle("sun")} className={`vbtn ${mode === "sun" ? "vbtn-on" : ""}`}>
          <Sun className="h-3.5 w-3.5" /> 채광
        </button>
      </div>

      {mode === "sun" && (
        <div className="pointer-events-none absolute bottom-14 left-3 right-3 z-20">
          <SunlightControlBar
            params={params}
            sunState={sunState}
            direction={room.direction}
            playing={playing}
            onChangeParams={updateParams}
            onTogglePlay={togglePlay}
            onUpdateRoomLocationAndDirection={(patch) => onUpdateRoom?.(patch)}
            onClose={() => setMode("none")}
          />
        </div>
      )}

      {mode === "measure" && (
        <MeasureBanner
          distance={measure.length === 2 ? measure[0].distanceTo(measure[1]) : null}
          hasStart={measure.length === 1}
        />
      )}
      {mode === "pin" && (
        <PinPrompt
          position={pending}
          onSave={(pin) => {
            onAddPin?.(pin);
            setPending(null);
            setMode("none");
          }}
        />
      )}
      {mode === "furniture" && (
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
        className={`min-h-[340px] w-full flex-1 ${mode !== "none" && mode !== "sun" ? "cursor-crosshair" : ""}`}
        style={{ touchAction: "none" }}
      />
      <PinLabels pins={projected} />

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => toggle("sun")}
          className="vbar pointer-events-auto px-2.5 py-1 text-xs hover:text-amber-300"
          title="위치·방위 기반 채광 설정 열기"
        >
          {room.direction || "남향"} · {sunState.isDirectSunlight ? "직사광" : "간접광"}
        </button>

        {bounds && (
          <label className="vbar pointer-events-auto min-w-[180px] flex-1 gap-3 px-3 py-1.5">
            <span className="shrink-0 text-xs">천장 단면</span>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max + 1}
              step={0.05}
              value={clipY}
              onChange={(e) => setClipY(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
          </label>
        )}
      </div>

      {status === "loading" && <ViewerLoading text="스캔 불러오는 중…" />}
      {status === "error" && <ViewerLoading text="3D 모델을 불러오지 못했습니다." />}
    </div>
  );
}
