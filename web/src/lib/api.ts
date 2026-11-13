import { RoomItem, RoomPin } from "@/types/room";
import { DEFAULT_SAMPLE_ROOMS } from "./defaultRooms";

const LS_KEY = "myroom_rooms_v1";

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    // 같은 Wi-Fi에서 폰이 노트북 IP로 접속해도 같은 호스트의 8000 포트를 사용
    if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return `${protocol}//${hostname}:8000`;
    }
  }
  return "";
}

export function loadLocalRooms(): RoomItem[] {
  if (typeof window === "undefined") return DEFAULT_SAMPLE_ROOMS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RoomItem[];
      if (parsed.length) return parsed;
    }
  } catch {}
  return DEFAULT_SAMPLE_ROOMS;
}

export function saveLocalRooms(rooms: RoomItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rooms));
  } catch {}
}

async function req<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: (base: string) => req<{ status: string; engine: Record<string, unknown> }>(base, "/api/health"),
  list: (base: string) => req<RoomItem[]>(base, "/api/rooms"),
  create: (base: string, body: unknown) =>
    req<RoomItem>(base, "/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  update: (base: string, id: string, body: unknown) =>
    req<RoomItem>(base, `/api/rooms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  remove: (base: string, id: string) => req<{ status: string }>(base, `/api/rooms/${id}`, { method: "DELETE" }),
  addPin: (base: string, id: string, pin: Omit<RoomPin, "id">) =>
    req<RoomItem>(base, `/api/rooms/${id}/pins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pin),
    }),
  uploadVideo: (base: string, id: string, file: File, quality: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("quality", quality === "fast" ? "standard" : "high");
    return req<RoomItem>(base, `/api/rooms/${id}/upload-video`, { method: "POST", body: fd });
  },
  upload3d: (base: string, id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<RoomItem>(base, `/api/rooms/${id}/upload-3d`, { method: "POST", body: fd });
  },
};

