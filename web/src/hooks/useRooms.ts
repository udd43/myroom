"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiAuthError, getApiBaseUrl, loadLocalRooms, saveLocalRooms } from "@/lib/api";
import { DEFAULT_SAMPLE_ROOMS } from "@/lib/defaultRooms";
import { convertVideoToSplatClientSide, saveLocalSplatBuffer } from "@/lib/splatClientGenerator";
import { useAppStore } from "@/store/useAppStore";
import {
  AuthStatusResponse,
  FurnitureItem,
  IntegrationStatusResponse,
  NewRoomMeta,
  Quality,
  RoomItem,
  RoomPin,
  TimelineEvent,
  UploadKind,
} from "@/types/room";

export function useRooms() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const queryClient = useQueryClient();
  const authToken = useAppStore((s) => s.authToken);
  const setAuthToken = useAppStore((s) => s.setAuthToken);
  const clearAuthToken = useAppStore((s) => s.clearAuthToken);

  const [serverOnline, setServerOnline] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse>({
    authEnabled: false,
    authenticated: true,
    maxUploadMb: 150,
    r2Enabled: false,
  });
  const [integrations, setIntegrations] = useState<IntegrationStatusResponse | null>(null);
  const [engineSummary, setEngineSummary] = useState<Record<string, unknown> | null>(null);
  const [localRooms, setLocalRooms] = useState<RoomItem[]>(() => {
    const saved = loadLocalRooms();
    return saved.length > 0 ? saved : DEFAULT_SAMPLE_ROOMS;
  });

  // Sync local mirror initially on client hydration
  useEffect(() => {
    const saved = loadLocalRooms();
    if (saved.length > 0) setLocalRooms(saved);
  }, []);

  const persistLocal = useCallback((next: RoomItem[]) => {
    setLocalRooms(next);
    saveLocalRooms(next);
  }, []);

  const roomsQueryKey = ["rooms", apiBase, authToken] as const;

  const roomsQuery = useQuery<RoomItem[]>({
    queryKey: roomsQueryKey,
    enabled: true,
    queryFn: async () => {
      if (!apiBase) {
        setServerOnline(false);
        return localRooms;
      }
      try {
        const health = await api.health(apiBase);
        setServerOnline(true);
        setEngineSummary(health.engine || null);
        if (health.capabilities) setIntegrations(health.capabilities);

        const st = await api.authStatus(apiBase);
        setAuthStatus(st);
        if (st.authEnabled && !st.authenticated) {
          return localRooms;
        }
        return await api.list(apiBase);
      } catch (err) {
        if (err instanceof ApiAuthError) {
          setServerOnline(true);
          setAuthStatus((prev) => ({ ...prev, authEnabled: true, authenticated: false }));
          return localRooms;
        }
        setServerOnline(false);
        return localRooms;
      }
    },
    refetchInterval: (query) => {
      const list = query.state.data || [];
      const busy = list.some((r) => r.status === "processing" || r.status === "queued");
      return busy ? 2000 : false;
    },
  });

  const rooms: RoomItem[] = serverOnline && (!authStatus.authEnabled || authStatus.authenticated)
    ? roomsQuery.data ?? localRooms
    : localRooms;

  const isLocked = serverOnline && authStatus.authEnabled && !authStatus.authenticated;

  const localUnsyncedRooms = useMemo(() => {
    if (!serverOnline || isLocked || !roomsQuery.data) return [];
    const serverIds = new Set(roomsQuery.data.map((r) => r.id));
    const defaultIds = new Set(DEFAULT_SAMPLE_ROOMS.map((r) => r.id));
    return localRooms.filter((r) => !serverIds.has(r.id) && !defaultIds.has(r.id));
  }, [serverOnline, isLocked, roomsQuery.data, localRooms]);

  const mutateRoomsCache = useCallback(
    (updater: (cur: RoomItem[]) => RoomItem[]) => {
      if (serverOnline && !isLocked) {
        queryClient.setQueryData<RoomItem[]>(roomsQueryKey, (old) => updater(old || rooms));
      } else {
        const next = updater(localRooms);
        persistLocal(next);
      }
    },
    [serverOnline, isLocked, queryClient, roomsQueryKey, rooms, localRooms, persistLocal]
  );

  const login = useCallback(
    async (password: string) => {
      if (!apiBase) return false;
      const res = await api.login(apiBase, password);
      setAuthToken(res.token);
      setAuthStatus((prev) => ({ ...prev, authenticated: true }));
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      return true;
    },
    [apiBase, setAuthToken, queryClient]
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setAuthStatus((prev) => ({ ...prev, authenticated: !prev.authEnabled }));
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
  }, [clearAuthToken, queryClient]);

  const syncLocalToServer = useCallback(async () => {
    if (!apiBase || !serverOnline || isLocked || localUnsyncedRooms.length === 0) return 0;
    const res = await api.syncRooms(apiBase, localUnsyncedRooms);
    queryClient.setQueryData<RoomItem[]>(roomsQueryKey, res.rooms);
    return res.syncedCount;
  }, [apiBase, serverOnline, isLocked, localUnsyncedRooms, queryClient, roomsQueryKey]);

  const addRoom = useCallback(
    async (meta: NewRoomMeta, file: File | null, kind: UploadKind, quality: Quality): Promise<string> => {
      if (serverOnline && !isLocked && apiBase) {
        const created = await api.create(apiBase, meta);
        mutateRoomsCache((cur) => [created, ...cur]);
        if (file) {
          const updated =
            kind === "3d"
              ? await api.upload3d(apiBase, created.id, file)
              : await api.uploadVideo(apiBase, created.id, file, quality);
          mutateRoomsCache((cur) => cur.map((r) => (r.id === created.id ? updated : r)));
        }
        return created.id;
      }

      // Offline browser fallback
      const id = `local-${Date.now()}`;
      const newRoom: RoomItem = {
        ...meta,
        id,
        pins: [],
        furnitures: [],
        timeline: [],
        status: file && kind === "video" ? "processing" : "ready",
        progress: file && kind === "video" ? 10 : 100,
        stageText: file ? "브라우저 로컬 3D 생성 중..." : "오프라인 저장 완료",
        splatUrl: null,
        spzUrl: null,
        plyUrl: null,
        modelUrl: null,
        usdzUrl: null,
        videoUrl: null,
        thumbUrl: null,
        splatCount: 0,
        engine: file ? "browser_volumetric" : null,
        createdAt: new Date().toISOString(),
      };
      const nextBase = [newRoom, ...localRooms];
      persistLocal(nextBase);

      if (file && kind === "video") {
        void (async () => {
          try {
            const res = await convertVideoToSplatClientSide(file, (pct, msg) => {
              setLocalRooms((cur) => {
                const updated = cur.map((r) =>
                  r.id === id ? { ...r, status: "processing" as const, progress: pct, stageText: msg } : r
                );
                saveLocalRooms(updated);
                return updated;
              });
            });
            await saveLocalSplatBuffer(id, res.splatBuffer);
            setLocalRooms((cur) => {
              const updated = cur.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      status: "ready" as const,
                      progress: 100,
                      stageText: `브라우저 로컬 스플랫 완료 (${res.splatData.count.toLocaleString()} surfels)`,
                      splatUrl: `local-idb://${id}`,
                      thumbUrl: res.thumbDataUrl,
                      splatCount: res.splatData.count,
                      engine: "browser_volumetric",
                    }
                  : r
              );
              saveLocalRooms(updated);
              return updated;
            });
          } catch (err) {
            setLocalRooms((cur) => {
              const updated = cur.map((r) =>
                r.id === id
                  ? { ...r, status: "error" as const, progress: 0, stageText: `로컬 변환 실패: ${String(err)}` }
                  : r
              );
              saveLocalRooms(updated);
              return updated;
            });
          }
        })();
      }

      return id;
    },
    [serverOnline, isLocked, apiBase, localRooms, persistLocal, mutateRoomsCache]
  );

  const updateRoom = useCallback(
    async (roomId: string, patch: Partial<RoomItem>) => {
      mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));
      if (serverOnline && !isLocked && apiBase) {
        try {
          const updated = await api.update(apiBase, roomId, patch);
          mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? updated : r)));
        } catch {
          // Keep optimistic update on brief hiccup
        }
      }
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const updateFurnitures = useCallback(
    async (roomId: string, items: FurnitureItem[]) => {
      await updateRoom(roomId, { furnitures: items });
    },
    [updateRoom]
  );

  const addPin = useCallback(
    async (roomId: string, pin: Omit<RoomPin, "id">) => {
      const optimisticPin: RoomPin = {
        ...pin,
        id: `pin-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      mutateRoomsCache((cur) =>
        cur.map((r) => (r.id === roomId ? { ...r, pins: [...(r.pins || []), optimisticPin] } : r))
      );
      if (serverOnline && !isLocked && apiBase) {
        const updated = await api.addPin(apiBase, roomId, pin);
        mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? updated : r)));
      }
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const deletePin = useCallback(
    async (roomId: string, pinId: string) => {
      mutateRoomsCache((cur) =>
        cur.map((r) =>
          r.id === roomId ? { ...r, pins: (r.pins || []).filter((p) => p.id !== pinId) } : r
        )
      );
      if (serverOnline && !isLocked && apiBase) {
        const updated = await api.deletePin(apiBase, roomId, pinId);
        mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? updated : r)));
      }
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const addTimelineEvent = useCallback(
    async (roomId: string, event: Omit<TimelineEvent, "id">) => {
      const optimistic: TimelineEvent = { ...event, id: `tl-${Date.now()}` };
      mutateRoomsCache((cur) =>
        cur.map((r) =>
          r.id === roomId ? { ...r, timeline: [...(r.timeline || []), optimistic] } : r
        )
      );
      if (serverOnline && !isLocked && apiBase) {
        const updated = await api.addTimelineEvent(apiBase, roomId, event);
        mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? updated : r)));
      }
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const deleteTimelineEvent = useCallback(
    async (roomId: string, eventId: string) => {
      mutateRoomsCache((cur) =>
        cur.map((r) =>
          r.id === roomId
            ? { ...r, timeline: (r.timeline || []).filter((t) => t.id !== eventId) }
            : r
        )
      );
      if (serverOnline && !isLocked && apiBase) {
        const updated = await api.deleteTimelineEvent(apiBase, roomId, eventId);
        mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? updated : r)));
      }
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const removeRoom = useCallback(
    async (roomId: string) => {
      mutateRoomsCache((cur) => cur.filter((r) => r.id !== roomId));
      if (serverOnline && !isLocked && apiBase) {
        await api.remove(apiBase, roomId);
      }
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const uploadScanToRoom = useCallback(
    async (roomId: string, file: File) => {
      if (!serverOnline || isLocked || !apiBase) return;
      const ext = file.name.toLowerCase();
      const is3d = [".glb", ".usdz", ".json", ".splat", ".spz", ".sog", ".ply"].some((e) =>
        ext.endsWith(e)
      );
      const updated = is3d
        ? await api.upload3d(apiBase, roomId, file)
        : await api.uploadVideo(apiBase, roomId, file, "high");
      mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? updated : r)));
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const createShareLink = useCallback(
    async (roomId: string, regenerate = false) => {
      if (!serverOnline || isLocked || !apiBase) return null;
      const res = await api.createShareLink(apiBase, roomId, regenerate);
      mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? res.room : r)));
      return res.shareToken;
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  const revokeShareLink = useCallback(
    async (roomId: string) => {
      if (!serverOnline || isLocked || !apiBase) return;
      const res = await api.revokeShareLink(apiBase, roomId);
      mutateRoomsCache((cur) => cur.map((r) => (r.id === roomId ? res.room : r)));
    },
    [serverOnline, isLocked, apiBase, mutateRoomsCache]
  );

  return {
    rooms,
    serverOnline,
    apiBase,
    authStatus,
    isLocked,
    integrations,
    engineSummary,
    localUnsyncedCount: localUnsyncedRooms.length,
    isLoading: roomsQuery.isLoading,
    login,
    logout,
    syncLocalToServer,
    addRoom,
    updateRoom,
    updateFurnitures,
    addPin,
    deletePin,
    addTimelineEvent,
    deleteTimelineEvent,
    removeRoom,
    uploadScanToRoom,
    createShareLink,
    revokeShareLink,
    refreshRooms: () => queryClient.invalidateQueries({ queryKey: ["rooms"] }),
  };
}
