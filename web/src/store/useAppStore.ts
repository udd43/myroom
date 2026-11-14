"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CommuteDestination {
  label: string;
  latitude: number;
  longitude: number;
}

export const WORKPLACE_PRESETS: CommuteDestination[] = [
  { label: "강남역 (테헤란로)", latitude: 37.4979, longitude: 127.0276 },
  { label: "여의도 (IFC몰)", latitude: 37.5251, longitude: 126.9255 },
  { label: "광화문 · 시청", latitude: 37.5714, longitude: 126.9768 },
  { label: "성수 · 왕십리", latitude: 37.5446, longitude: 127.056 },
  { label: "판교 테크노밸리", latitude: 37.4017, longitude: 127.1089 },
  { label: "홍대입구 · 신촌", latitude: 37.5568, longitude: 126.9238 },
];

interface AppUiState {
  authToken: string;
  setAuthToken: (token: string) => void;
  clearAuthToken: () => void;

  /** Compare / effective-cost calculator parameters */
  loanRatePct: number;
  setLoanRatePct: (pct: number) => void;

  commuteDest: CommuteDestination;
  setCommuteDest: (dest: CommuteDestination) => void;

  /** Snap preferences shared across 2D & 3D furniture editors */
  snapAngleDeg: number;
  setSnapAngleDeg: (deg: number) => void;
  snapToWalls: boolean;
  setSnapToWalls: (enabled: boolean) => void;
}

export const useAppStore = create<AppUiState>()(
  persist(
    (set) => ({
      authToken: "",
      setAuthToken: (token) => set({ authToken: token }),
      clearAuthToken: () => set({ authToken: "" }),

      loanRatePct: 4.0,
      setLoanRatePct: (pct) => set({ loanRatePct: Math.max(0, Math.min(15, pct)) }),

      commuteDest: WORKPLACE_PRESETS[0],
      setCommuteDest: (dest) => set({ commuteDest: dest }),

      snapAngleDeg: 15,
      setSnapAngleDeg: (deg) => set({ snapAngleDeg: deg }),
      snapToWalls: true,
      setSnapToWalls: (enabled) => set({ snapToWalls: enabled }),
    }),
    {
      name: "myroom_ui_prefs_v1",
    }
  )
);
