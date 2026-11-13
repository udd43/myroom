"use client";

import React, { useState } from "react";
import * as THREE from "three";
import { FurnitureItem } from "@/types/room";
import { Move, Plus, RotateCw, Trash2 } from "lucide-react";

export const FURNITURE_PRESETS: Array<Omit<FurnitureItem, "id" | "position" | "rotationY">> = [
  { name: "퀸 침대", widthM: 1.5, depthM: 2.0, heightM: 0.55, color: "#0284c7" },
  { name: "슈퍼싱글", widthM: 1.1, depthM: 2.0, heightM: 0.55, color: "#0369a1" },
  { name: "데스크 1400", widthM: 1.4, depthM: 0.7, heightM: 0.75, color: "#d97706" },
  { name: "냉장고", widthM: 0.7, depthM: 0.7, heightM: 1.8, color: "#059669" },
  { name: "세탁기", widthM: 0.65, depthM: 0.65, heightM: 0.85, color: "#4f46e5" },
  { name: "3인 소파", widthM: 2.0, depthM: 0.85, heightM: 0.78, color: "#b93800" },
];

/**
 * Three.js 그룹 안에 가구 3D 박스 메시 + 외곽선을 생성/동기화합니다.
 */
export function buildFurnitureGroup(
  group: THREE.Group,
  items: FurnitureItem[],
  selectedId: string | null
): Map<string, THREE.Mesh> {
  group.clear();
  const map = new Map<string, THREE.Mesh>();

  for (const item of items) {
    const geo = new THREE.BoxGeometry(item.widthM, item.heightM, item.depthM);
    const isSel = item.id === selectedId;
    const mat = new THREE.MeshBasicMaterial({
      color: item.color || "#0284c7",
      transparent: true,
      opacity: isSel ? 0.58 : 0.38,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...item.position);
    mesh.rotation.y = item.rotationY || 0;
    mesh.userData = { furnitureId: item.id, furnitureItem: item };

    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color: isSel ? "#ffffff" : item.color || "#38bdf8",
    });
    mesh.add(new THREE.LineSegments(edges, lineMat));

    group.add(mesh);
    map.set(item.id, mesh);
  }
  return map;
}

interface PaletteProps {
  furnitures: FurnitureItem[];
  selectedId: string | null;
  gizmoMode: "translate" | "rotate";
  onChangeGizmoMode: (m: "translate" | "rotate") => void;
  onSelect: (id: string | null) => void;
  onAdd: (item: FurnitureItem) => void;
  onDelete: (id: string) => void;
}

export function FurniturePaletteBar({
  furnitures,
  selectedId,
  gizmoMode,
  onChangeGizmoMode,
  onSelect,
  onAdd,
  onDelete,
}: PaletteProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [cName, setCName] = useState("수납장");
  const [cW, setCW] = useState(80);
  const [cD, setCD] = useState(45);
  const [cH, setCH] = useState(120);

  const addPreset = (p: (typeof FURNITURE_PRESETS)[number]) => {
    const item: FurnitureItem = {
      ...p,
      id: `furn-${Date.now()}`,
      position: [0, -1.24 + p.heightM / 2, 0],
      rotationY: 0,
    };
    onAdd(item);
    onSelect(item.id);
  };

  return (
    <div className="absolute left-3 right-3 top-14 z-20 flex flex-col gap-1.5 border border-white/20 bg-stage/95 p-2.5 text-xs text-white backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 font-semibold text-white/80">가구 소환:</span>
          {FURNITURE_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => addPreset(p)}
              className="border border-white/20 bg-white/5 px-2 py-1 text-[11px] hover:bg-accent hover:border-accent"
            >
              + {p.name} ({Math.round(p.widthM * 100)}×{Math.round(p.depthM * 100)})
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="border border-white/30 px-2 py-1 text-[11px] font-semibold hover:bg-white/15"
          >
            <Plus className="inline h-3 w-3" /> 치수 직접입력
          </button>
        </div>

        {selectedId && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChangeGizmoMode("translate")}
              className={`vbtn border border-white/20 ${gizmoMode === "translate" ? "vbtn-on" : ""}`}
            >
              <Move className="h-3 w-3" /> 이동 기즈모
            </button>
            <button
              type="button"
              onClick={() => onChangeGizmoMode("rotate")}
              className={`vbtn border border-white/20 ${gizmoMode === "rotate" ? "vbtn-on" : ""}`}
            >
              <RotateCw className="h-3 w-3" /> 회전 기즈모
            </button>
            <button
              type="button"
              onClick={() => onDelete(selectedId)}
              className="vbtn border border-white/20 text-red-300 hover:bg-red-700 hover:text-white"
            >
              <Trash2 className="h-3 w-3" /> 삭제
            </button>
          </div>
        )}
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/15 pt-2">
          <input
            value={cName}
            onChange={(e) => setCName(e.target.value)}
            placeholder="가구명"
            className="w-24 border border-white/25 bg-transparent px-2 py-1 text-xs"
          />
          <label className="num flex items-center gap-1">
            가로(cm)
            <input
              type="number"
              value={cW}
              onChange={(e) => setCW(Number(e.target.value))}
              className="w-14 border border-white/25 bg-transparent px-1.5 py-1"
            />
          </label>
          <label className="num flex items-center gap-1">
            세로(cm)
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
                f.id === selectedId
                  ? "border-accent bg-accent text-white font-semibold"
                  : "border-white/20 bg-white/5 hover:bg-white/15"
              }`}
            >
              {f.name} ({Math.round(f.widthM * 100)}×{Math.round(f.depthM * 100)}cm)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

