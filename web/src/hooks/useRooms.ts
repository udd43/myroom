"use client";

import { useCallback, useEffect, useState } from "react";
import { FurnitureItem, NewRoomMeta, Quality, RoomItem, RoomPin, UploadKind } from "@/types/room";
import { api, getApiBaseUrl, loadLocalRooms, saveLocalRooms } from "@/lib/api";
import {
  convertVideoToSplatClientSide,
  parseSplatArrayBuffer,
  saveLocalSplatBuffer,
} from "@/lib/splatClientGenerator";

export function useRooms() {
  const [apiBase, setApiBase] = useState("");
  const [online, setOnline] = useState(false);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (base: string) => {
    try {
      setRooms(await api.list(base));
      setOnline(true);
      return true;
    } catch {
      setOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const base = getApiBaseUrl();
    setApiBase(base);
    refresh(base).then((ok) => {
      if (!ok) setRooms(loadLocalRooms());
      setReady(true);
    });
  }, [refresh]);

  useEffect(() => {
    if (ready && !online) saveLocalRooms(rooms);
  }, [rooms, online, ready]);

  const processing = rooms.some((r) => r.status === "processing");
  useEffect(() => {
    if (!online || !processing) return;
    const t = setInterval(() => refresh(apiBase), 2000);
    return () => clearInterval(t);
  }, [online, processing, apiBase, refresh]);

  const patchLocal = (id: string, patch: Partial<RoomItem>) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRoom = async (
    meta: NewRoomMeta,
    file: File | null,
    kind: UploadKind,
    quality: Quality
  ): Promise<string> => {
    if (online) {
      const created = await api.create(apiBase, meta);
      if (file && kind === "video") await api.uploadVideo(apiBase, created.id, file, quality);
      else if (file && kind === "3d") await api.upload3d(apiBase, created.id, file);
      await refresh(apiBase);
      return created.id;
    }

    const id = `local-${Date.now()}`;
    setRooms((prev) => [
      {
        ...meta,
        id,
        MoveInDate: "협의",
        rating: 4,
        pins: [],
        furnitures: [],
        status: file ? "processing" : "empty",
        progress: 0,
        stageText: file ? "변환 준비 중" : "영상 또는 3D 파일을 올려 주세요.",
        splatUrl: null,
        plyUrl: null,
        videoUrl: null,
        thumbUrl: null,
        splatCount: 0,
        engine: null,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    if (file) void convertLocally(id, file, kind);
    return id;
  };

  const convertLocally = async (id: string, file: File, kind: UploadKind) => {
    try {
      if (kind === "3d" && file.name.endsWith(".splat")) {
        const buf = await file.arrayBuffer();
        await saveLocalSplatBuffer(id, buf);
        patchLocal(id, {
          status: "ready",
          progress: 100,
          splatCount: parseSplatArrayBuffer(buf).count,
          stageText: "3D 파일 로드 완료",
          engine: "direct_3d_upload",
        });
      } else if (kind === "video") {
        const res = await convertVideoToSplatClientSide(file, (p, s) =>
          patchLocal(id, { progress: p, stageText: s })
        );
        await saveLocalSplatBuffer(id, res.splatBuffer);
        patchLocal(id, {
          status: "ready",
          progress: 100,
          splatCount: res.splatData.count,
          thumbUrl: res.thumbDataUrl,
          stageText: "브라우저 간이 변환 완료",
          engine: "browser_volumetric",
        });
      } else {
        patchLocal(id, { status: "error", stageText: "이 파일 형식은 서버 연결이 필요합니다." });
      }
    } catch (e) {
      patchLocal(id, { status: "error", stageText: `변환 실패: ${(e as Error).message}` });
    }
  };

  const addPin = async (roomId: string, pin: Omit<RoomPin, "id">) => {
    if (online) {
      await api.addPin(apiBase, roomId, pin);
      await refresh(apiBase);
    } else {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId ? { ...r, pins: [...r.pins, { ...pin, id: `pin-${Date.now()}` }] } : r
        )
      );
    }
  };

  const updateFurnitures = async (roomId: string, furnitures: FurnitureItem[]) => {
    patchLocal(roomId, { furnitures });
    if (online) {
      await api.update(apiBase, roomId, { furnitures }).catch(() => {});
    }
  };

  const updateRoom = async (roomId: string, patch: Partial<RoomItem>) => {
    patchLocal(roomId, patch);
    if (online) {
      await api.update(apiBase, roomId, patch).catch(() => {});
    }
  };

  const uploadScanToRoom = async (roomId: string, file: File) => {
    const lower = file.name.toLowerCase();
    const is3d = [".glb", ".usdz", ".json", ".splat", ".ply"].some((ext) => lower.endsWith(ext));
    if (online) {
      if (is3d) await api.upload3d(apiBase, roomId, file);
      else await api.uploadVideo(apiBase, roomId, file, "high");
      await refresh(apiBase);
    } else {
      await convertLocally(roomId, file, is3d ? "3d" : "video");
    }
  };

  const removeRoom = async (id: string) => {
    if (online) {
      await api.remove(apiBase, id).catch(() => {});
      await refresh(apiBase);
    } else {
      setRooms((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return {
    apiBase,
    online,
    ready,
    rooms,
    addRoom,
    addPin,
    updateFurnitures,
    updateRoom,
    uploadScanToRoom,
    removeRoom,
  };
}
