"use client";

import React, { useState } from "react";
import { FurnitureItem, RoomItem, RoomPin } from "@/types/room";
import MeshRoomViewer from "./MeshRoomViewer";
import VolumetricRoomViewer, { SyncedOrbitState } from "./VolumetricRoomViewer";

interface Props {
  room: RoomItem;
  apiBaseUrl: string;
  compact?: boolean;
  readOnly?: boolean;
  syncedCamera?: SyncedOrbitState | null;
  onCameraSyncChange?: (state: SyncedOrbitState) => void;
  onAddPin?: (pin: Omit<RoomPin, "id">) => void;
  onUpdateFurnitures?: (items: FurnitureItem[]) => void;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
}

export default function RoomViewer(props: Props) {
  const { room } = props;
  const hasMesh = Boolean(room.modelUrl || room.usdzUrl);
  const hasSplat = Boolean(room.splatUrl || room.spzUrl || room.localSplatPreset);
  const preferMeshByDefault = Boolean(
    room.modelUrl || (room.usdzUrl && (!room.splatUrl || room.engine === "apple_roomplan"))
  );
  const [preferMesh, setPreferMesh] = useState(preferMeshByDefault);

  const showMesh = hasMesh && (!hasSplat || preferMesh);

  return (
    <div className="relative h-full w-full">
      {hasMesh && hasSplat && !props.compact && (
        <button
          type="button"
          onClick={() => setPreferMesh((v) => !v)}
          className="absolute right-3 top-14 z-30 border border-white/25 bg-stage/90 px-2.5 py-1 text-[11px] font-medium text-white hover:border-accent"
          title="3D 메시(.glb/.usdz)와 가우시안 스플랫 뷰어 전환"
        >
          {showMesh ? "스플랫 보기 전환" : "USDZ/GLB 메시 보기"}
        </button>
      )}
      {showMesh ? <MeshRoomViewer {...props} /> : <VolumetricRoomViewer {...props} />}
    </div>
  );
}
