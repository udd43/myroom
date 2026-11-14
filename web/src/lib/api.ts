import {
  AuthStatusResponse,
  BuildingRegistryInfo,
  CommuteInfo,
  IntegrationStatusResponse,
  NearbyPoiInfo,
  NewRoomMeta,
  NeighborBuilding,
  RentMarketInfo,
  RoomItem,
  RoomPin,
  TimelineEvent,
} from "@/types/room";
import { useAppStore } from "@/store/useAppStore";

const LS_KEY = "myroom_rooms_v1";

export class ApiAuthError extends Error {
  constructor(message = "관리자 로그인이 필요합니다.") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export function getApiBaseUrl(): string {
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (envUrl) return envUrl;
  if (typeof window === "undefined") return "";
  const { hostname, protocol } = window.location;
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  return isLocalHost ? `${protocol}//${hostname}:8000` : "";
}

export function resolveMediaUrl(apiBase: string, url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  return apiBase ? `${apiBase}${url}` : url;
}

export function loadLocalRooms(): RoomItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalRooms(rooms: RoomItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(rooms));
  } catch {
    // Ignore storage quota errors
  }
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = useAppStore.getState().authToken;
  const headers: Record<string, string> = { ...(extra || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function reqJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = getAuthHeaders((init?.headers as Record<string, string>) || {});
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    throw new ApiAuthError("인증이 만료되었거나 관리자 비밀번호가 필요합니다.");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.detail) detail = String(errBody.detail);
    } catch {
      // keep HTTP code
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  async health(base: string) {
    return reqJson<{
      status: string;
      engine?: Record<string, unknown>;
      storage?: { backend: string; journalMode: string; roomCount: number };
      queue?: { maxConcurrent: number; activeJobs: number; queuedJobs: number };
      capabilities?: IntegrationStatusResponse;
    }>(`${base}/api/health`);
  },

  async authStatus(base: string): Promise<AuthStatusResponse> {
    return reqJson<AuthStatusResponse>(`${base}/api/auth/status`);
  },

  async login(base: string, password: string): Promise<{ authenticated: boolean; token: string; expiresAt: number }> {
    return reqJson(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  },

  async list(base: string): Promise<RoomItem[]> {
    const data = await reqJson<RoomItem[] | { rooms?: RoomItem[] }>(`${base}/api/rooms`);
    return Array.isArray(data) ? data : data.rooms || [];
  },

  async get(base: string, id: string): Promise<RoomItem> {
    return reqJson<RoomItem>(`${base}/api/rooms/${encodeURIComponent(id)}`);
  },

  async create(base: string, meta: NewRoomMeta): Promise<RoomItem> {
    return reqJson<RoomItem>(`${base}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
  },

  async syncRooms(base: string, rooms: RoomItem[]): Promise<{ syncedCount: number; rooms: RoomItem[] }> {
    return reqJson(`${base}/api/rooms/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rooms }),
    });
  },

  async update(base: string, id: string, patch: Partial<RoomItem>): Promise<RoomItem> {
    return reqJson<RoomItem>(`${base}/api/rooms/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  async remove(base: string, id: string): Promise<void> {
    await reqJson(`${base}/api/rooms/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async addPin(base: string, id: string, pin: Omit<RoomPin, "id">): Promise<RoomItem> {
    return reqJson<RoomItem>(`${base}/api/rooms/${encodeURIComponent(id)}/pins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pin),
    });
  },

  async deletePin(base: string, roomId: string, pinId: string): Promise<RoomItem> {
    return reqJson<RoomItem>(
      `${base}/api/rooms/${encodeURIComponent(roomId)}/pins/${encodeURIComponent(pinId)}`,
      { method: "DELETE" }
    );
  },

  async addTimelineEvent(base: string, roomId: string, event: Omit<TimelineEvent, "id">): Promise<RoomItem> {
    return reqJson<RoomItem>(`${base}/api/rooms/${encodeURIComponent(roomId)}/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  },

  async deleteTimelineEvent(base: string, roomId: string, eventId: string): Promise<RoomItem> {
    return reqJson<RoomItem>(
      `${base}/api/rooms/${encodeURIComponent(roomId)}/timeline/${encodeURIComponent(eventId)}`,
      { method: "DELETE" }
    );
  },

  async createShareLink(base: string, roomId: string, regenerate = false): Promise<{ shareToken: string; room: RoomItem }> {
    return reqJson(`${base}/api/rooms/${encodeURIComponent(roomId)}/share?regenerate=${regenerate ? "true" : "false"}`, {
      method: "POST",
    });
  },

  async revokeShareLink(base: string, roomId: string): Promise<{ ok: boolean; room: RoomItem }> {
    return reqJson(`${base}/api/rooms/${encodeURIComponent(roomId)}/share`, { method: "DELETE" });
  },

  async getSharedRoom(base: string, token: string): Promise<{ readOnly: boolean; room: RoomItem }> {
    return reqJson(`${base}/api/share/${encodeURIComponent(token)}`);
  },

  async uploadVideo(base: string, id: string, file: File, quality: string): Promise<RoomItem> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("quality", quality);
    return reqJson<RoomItem>(`${base}/api/rooms/${encodeURIComponent(id)}/upload-video`, {
      method: "POST",
      body: fd,
    });
  },

  async upload3d(base: string, id: string, file: File): Promise<RoomItem> {
    const fd = new FormData();
    fd.append("file", file);
    return reqJson<RoomItem>(`${base}/api/rooms/${encodeURIComponent(id)}/upload-3d`, {
      method: "POST",
      body: fd,
    });
  },

  async uploadMedia(base: string, id: string, file: File): Promise<{ url: string; mediaType: "image" | "video" | "audio" }> {
    const fd = new FormData();
    fd.append("file", file);
    return reqJson(`${base}/api/rooms/${encodeURIComponent(id)}/upload-media`, {
      method: "POST",
      body: fd,
    });
  },

  // --- Korean Real-Estate & Location Integrations ---
  async integrationStatus(base: string): Promise<IntegrationStatusResponse> {
    return reqJson<IntegrationStatusResponse>(`${base}/api/integrations/status`);
  },

  async searchAddress(base: string, q: string): Promise<{
    juso: {
      configured: boolean;
      error?: string;
      items: Array<{
        roadAddr: string;
        jibunAddr: string;
        zipNo: string;
        bdNm: string;
        admCd: string;
        sigunguCd: string;
        bjdongCd: string;
        platGbCd: string;
        bun: string;
        ji: string;
      }>;
    };
    kakao?: {
      configured: boolean;
      found?: boolean;
      latitude?: number;
      longitude?: number;
      addressName?: string;
      regionLabel?: string;
      sigunguCd?: string;
      bjdongCd?: string;
      bun?: string;
      ji?: string;
    } | null;
  }> {
    return reqJson(`${base}/api/integrations/address/search?q=${encodeURIComponent(q)}`);
  },

  async geocodeKakao(base: string, q: string) {
    return reqJson<{
      configured: boolean;
      found?: boolean;
      latitude?: number;
      longitude?: number;
      addressName?: string;
      regionLabel?: string;
      sigunguCd?: string;
      bjdongCd?: string;
      bun?: string;
      ji?: string;
      candidates?: Array<{
        name?: string;
        address?: string;
        latitude: number;
        longitude: number;
      }>;
    }>(`${base}/api/integrations/geocode?q=${encodeURIComponent(q)}`);
  },

  async getBuildingRegistry(
    base: string,
    params: { sigunguCd: string; bjdongCd: string; bun: string; ji?: string; platGbCd?: string }
  ): Promise<BuildingRegistryInfo> {
    const qs = new URLSearchParams({
      sigunguCd: params.sigunguCd,
      bjdongCd: params.bjdongCd,
      bun: params.bun,
      ji: params.ji || "0000",
      platGbCd: params.platGbCd || "0",
    });
    return reqJson(`${base}/api/integrations/building-registry?${qs.toString()}`);
  },

  async getRentMarket(
    base: string,
    params: { lawdCd: string; deposit?: number; monthlyRent?: number; areaSqm?: number; umd?: string; ratePct?: number }
  ): Promise<RentMarketInfo> {
    const qs = new URLSearchParams({
      lawdCd: params.lawdCd,
      deposit: String(params.deposit ?? 0),
      monthlyRent: String(params.monthlyRent ?? 0),
      areaSqm: String(params.areaSqm ?? 0),
      umd: params.umd || "",
      ratePct: String(params.ratePct ?? 4.5),
    });
    return reqJson(`${base}/api/integrations/rent-market?${qs.toString()}`);
  },

  async getNearbyPoi(base: string, lat: number, lng: number): Promise<NearbyPoiInfo> {
    return reqJson(`${base}/api/integrations/nearby?lat=${lat}&lng=${lng}`);
  },

  async getCommute(
    base: string,
    params: { originLat: number; originLng: number; destLat: number; destLng: number; destLabel: string }
  ): Promise<CommuteInfo> {
    const qs = new URLSearchParams({
      originLat: String(params.originLat),
      originLng: String(params.originLng),
      destLat: String(params.destLat),
      destLng: String(params.destLng),
      destLabel: params.destLabel,
    });
    return reqJson(`${base}/api/integrations/commute?${qs.toString()}`);
  },

  async getVworldBuildings(
    base: string,
    lat: number,
    lng: number,
    radiusM = 95
  ): Promise<{ configured: boolean; buildings: NeighborBuilding[]; error?: string }> {
    return reqJson(`${base}/api/integrations/vworld/buildings?lat=${lat}&lng=${lng}&radiusM=${radiusM}`);
  },
};
