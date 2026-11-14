"use client";

import React, { useState } from "react";
import * as THREE from "three";
import { AlertTriangle, Magnet, Move, Plus, RotateCw, Trash2 } from "lucide-react";
import { SpatialConflict } from "@/lib/floorplanCollision";
import { useAppStore } from "@/store/useAppStore";
import { FurnitureItem } from "@/types/room";

export interface FurniturePreset {
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  color: string;
  group?: "침실/거실" | "가전/수납";
}

export const FURNITURE_PRESETS: FurniturePreset[] = [
  { name: "슈퍼싱글 침대", widthM: 1.1, depthM: 2.0, heightM: 0.5, color: "#0284c7", group: "침실/거실" },
  { name: "퀸 침대", widthM: 1.5, depthM: 2.0, heightM: 0.55, color: "#0369a1", group: "침실/거실" },
  { name: "데스크 1200", widthM: 1.2, depthM: 0.6, heightM: 0.75, color: "#059669", group: "침실/거실" },
  { name: "데스크 1400", widthM: 1.4, depthM: 0.72, heightM: 0.75, color: "#15803d", group: "침실/거실" },
  { name: "3인 소파", widthM: 2.1, depthM: 0.85, heightM: 0.75, color: "#d97706", group: "침실/거실" },
  { name: "2인 식탁", widthM: 0.8, depthM: 0.8, heightM: 0.74, color: "#a16207", group: "침실/거실" },
  { name: "드럼세탁기", widthM: 0.6, depthM: 0.65, heightM: 0.85, color: "#0891b2", group: "가전/수납" },
  { name: "일반 냉장고", widthM: 0.6, depthM: 0.65, heightM: 1.75, color: "#0f766e", group: "가전/수납" },
  { name: "양문형 냉장고", widthM: 0.91, depthM: 0.75, heightM: 1.79, color: "#0369a1", group: "가전/수납" },
  { name: "스탠드 행거", widthM: 1.1, depthM: 0.45, heightM: 1.6, color: "#ea580c", group: "가전/수납" },
  { name: "2문 옷장", widthM: 0.8, depthM: 0.6, heightM: 2.0, color: "#64748b", group: "가전/수납" },
  { name: "5단 수납장", widthM: 0.8, depthM: 0.4, heightM: 1.2, color: "#7c3aed", group: "가전/수납" },
];

/** 3D 씬 내에 실제 규격 가구(반투명 박스 + 윤곽선 + 상단 치수)를 생성합니다. */
export function buildFurnitureGroup(
  group: THREE.Group,
  items: FurnitureItem[],
  selectedId: string | null,
  conflictIds: Set<string> = new Set(),
  floorY = -1.25
): Map<string, THREE.Object3D> {
  group.clear();
  const meshMap = new Map<string, THREE.Object3D>();

  for (const item of items) {
    const holder = new THREE.Group();
    const snappedY = Number.isFinite(item.position[1]) ? item.position[1] : floorY + item.heightM / 2;
    holder.position.set(item.position[0], snappedY, item.position[2]);
    holder.rotation.y = item.rotationY || 0;
    holder.userData.furnitureId = item.id;

    const isSelected = item.id === selectedId;
    const hasConflict = conflictIds.has(item.id);
    const geo = new THREE.BoxGeometry(item.widthM, item.heightM, item.depthM);
    const baseColor = hasConflict ? "#dc2626" : item.color || "#0284c7";
    const mat = new THREE.MeshLambertMaterial({
      color: baseColor,
      transparent: true,
      opacity: isSelected ? 0.62 : 0.4,
    });
    const boxMesh = new THREE.Mesh(geo, mat);
    boxMesh.userData.furnitureId = item.id;

    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color: hasConflict ? "#fca5a5" : isSelected ? "#ffffff" : baseColor,
      linewidth: 2,
    });
    const wire = new THREE.LineSegments(edges, lineMat);
    wire.userData.furnitureId = item.id;

    holder.add(boxMesh);
    holder.add(wire);
    group.add(holder);
    meshMap.set(item.id, holder);
  }

  return meshMap;
}

interface PaletteProps {
  furnitures: FurnitureItem[];
  selectedId: string | null;
  gizmoMode: "translate" | "rotate";
  conflicts?: SpatialConflict[];
  onChangeGizmoMode: (m: "translate" | "rotate") => void;
  onSelect: (id: string | null) => void;
  onAdd: (item: FurnitureItem) => void;
  onRotateSelected?: (deltaDeg: number) => void;
  onDelete: (id: string) => void;
}

export function FurniturePaletteBar({
  furnitures,
  selectedId,
  gizmoMode,
  conflicts = [],
  onChangeGizmoMode,
  onSelect,
  onAdd,
  onRotateSelected,
  onDelete,
}: PaletteProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [cName, setCName] = useState("수납장");
  const [cW, setCW] = useState(100);
  const [cD, setCD] = useState(50);
  const [cH, setCH] = useState(80);

  const snapAngleDeg = useAppStore((s) => s.snapAngleDeg);
  const setSnapAngleDeg = useAppStore((s) => s.setSnapAngleDeg);
  const snapToWalls = useAppStore((s) => s.snapToWalls);
  const setSnapToWalls = useAppStore((s) => s.setSnapToWalls);

  const conflictIds = new Set(conflicts.flatMap((c) => c.furnitureIds));

  const addFromPreset = (p: FurniturePreset) => {
    const newItem: FurnitureItem = {
      id: `furn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: p.name,
      widthM: p.widthM,
      depthM: p.depthM,
      heightM: p.heightM,
      position: [0, -1.24 + p.heightM / 2, 0],
      rotationY: 0,
      color: p.color,
    };
    onAdd(newItem);
    onSelect(newItem.id);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute left-3 right-3 top-14 z-20 flex flex-col gap-1.5 border border-white/20 bg-stage/95 p-2.5 text-xs text-white shadow-xl"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-white/75">자취/원룸 규격:</span>
        {FURNITURE_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => addFromPreset(p)}
            className="border border-white/20 bg-white/10 px-2 py-1 hover:bg-accent hover:border-accent"
            title={`${Math.round(p.widthM * 100)}×${Math.round(p.depthM * 100)}×${Math.round(p.heightM * 100)} cm`}
          >
            + {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="flex items-center gap-1 border border-white/25 px-2 py-1 text-white/85 hover:bg-white/10"
        >
          <Plus className="h-3 w-3" /> 직접 cm
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSnapAngleDeg(snapAngleDeg === 15 ? 90 : snapAngleDeg === 90 ? 0 : 15)}
            className={`px-2 py-1 ${snapAngleDeg > 0 ? "bg-sky-700 text-white" : "bg-white/10 text-white/75"}`}
            title="회전 자석 스냅 각도 전환 (15° / 90° / 끔)"
          >
            회전스냅 {snapAngleDeg > 0 ? `${snapAngleDeg}°` : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setSnapToWalls(!snapToWalls)}
            className={`flex items-center gap-1 px-2 py-1 ${snapToWalls ? "bg-sky-700 text-white" : "bg-white/10 text-white/75"}`}
            title="벽면 가까이 이동 시 자동 밀착"
          >
            <Magnet className="h-3 w-3" /> 벽 스냅
          </button>
          <button
            type="button"
            onClick={() => onChangeGizmoMode("translate")}
            className={`flex items-center gap-1 px-2 py-1 ${gizmoMode === "translate" ? "bg-accent" : "bg-white/10"}`}
          >
            <Move className="h-3 w-3" /> 이동
          </button>
          <button
            type="button"
            onClick={() => onChangeGizmoMode("rotate")}
            className={`flex items-center gap-1 px-2 py-1 ${gizmoMode === "rotate" ? "bg-accent" : "bg-white/10"}`}
          >
            <RotateCw className="h-3 w-3" /> 회전
          </button>
          {selectedId && onRotateSelected && (
            <>
              <button
                type="button"
                onClick={() => onRotateSelected(15)}
                className="border border-white/20 bg-white/10 px-1.5 py-1 hover:bg-white/20"
              >
                +15°
              </button>
              <button
                type="button"
                onClick={() => onRotateSelected(90)}
                className="border border-white/20 bg-white/10 px-1.5 py-1 hover:bg-white/20"
              >
                +90°
              </button>
            </>
          )}
          {selectedId && (
            <button
              type="button"
              onClick={() => onDelete(selectedId)}
              className="flex items-center gap-1 bg-red-600/80 px-2 py-1 hover:bg-red-600"
            >
              <Trash2 className="h-3 w-3" /> 삭제
            </button>
          )}
        </div>
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/15 pt-2">
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="가구 이름"
            className="w-24 border border-white/25 bg-transparent px-2 py-1"
          />
          <label className="num flex items-center gap-1">
            폭(cm)
            <input
              type="number"
              value={cW}
              onChange={(e) => setCW(Number(e.target.value))}
              className="w-14 border border-white/25 bg-transparent px-1.5 py-1"
            />
          </label>
          <label className="num flex items-center gap-1">
            깊이(cm)
            <input
              type="number"
              value={cD}
              onChange={(e) => setCD(Number(e.target.value))}
              className="w-14 border border-white/25 bg-transparent px-1.5 py-1"
            />
          </label>
          <label className="num flex items-center gap-1">
            높이(cm)
            <input
              type="number"
              value={cH}
              onChange={(e) => setCH(Number(e.target.value))}
              className="w-14 border border-white/25 bg-transparent px-1.5 py-1"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const hM = Math.max(0.2, cH / 100);
              const item: FurnitureItem = {
                id: `furn-${Date.now()}`,
                name: cName.trim() || "가구",
                widthM: Math.max(0.2, cW / 100),
                depthM: Math.max(0.2, cD / 100),
                heightM: hM,
                position: [0, -1.24 + hM / 2, 0],
                rotationY: 0,
                color: "#0284c7",
              };
              onAdd(item);
              onSelect(item.id);
              setCustomOpen(false);
            }}
            className="bg-accent px-3 py-1 font-semibold text-white"
          >
            추가
          </button>
        </div>
      )}

      {furnitures.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-white/80">
          <span>배치됨:</span>
          {furnitures.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f.id === selectedId ? null : f.id)}
              className={`num border px-2 py-0.5 ${
                conflictIds.has(f.id)
                  ? "border-red-400 bg-red-900/70 text-red-100 font-semibold"
                  : f.id === selectedId
                    ? "border-accent bg-accent text-white font-semibold"
                    : "border-white/20 bg-white/5 hover:bg-white/15"
              }`}
            >
              {f.name} ({Math.round(f.widthM * 100)}×{Math.round(f.depthM * 100)}cm)
            </button>
          ))}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="space-y-0.5 border-t border-red-400/30 pt-1.5 text-[11px]">
          {conflicts.slice(0, 3).map((c) => (
            <div
              key={c.id}
              className={`flex items-center gap-1.5 ${
                c.severity === "error" ? "text-red-300" : "text-amber-300"
              }`}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{c.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
