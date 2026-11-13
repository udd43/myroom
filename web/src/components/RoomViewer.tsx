"use client";

import React from "react";
import { FurnitureItem, RoomItem, RoomPin } from "@/types/room";
import VolumetricRoomViewer, { SyncedOrbitState } from "./VolumetricRoomViewer";
import MeshRoomViewer from "./MeshRoomViewer";

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

export default function RoomViewer(props: Props) {
  if (props.room.modelUrl) {
    return (
      <MeshRoomViewer
        room={props.room}
        apiBaseUrl={props.apiBaseUrl}
        onAddPin={props.onAddPin}
        onUpdateFurnitures={props.onUpdateFurnitures}
        onUpdateRoom={props.onUpdateRoom}
      />
    );
  }
  return <VolumetricRoomViewer {...props} />;
}
