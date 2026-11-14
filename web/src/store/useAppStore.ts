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
  { label: "서울역 · 용산", latitude: 37.5547, longitude: 126.9707 },
  { label: "성수 · 왕십리", latitude: 37.5446, longitude: 127.056 },
  { label: "판교 테크노밸리", latitude: 37.4017, longitude: 127.1089 },
  { label: "구로 · 가산디지털단지", latitude: 37.4815, longitude: 126.8826 },
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

  customDestinations: CommuteDestination[];
  addCustomDestination: (dest: CommuteDestination) => void;
  removeCustomDestination: (label: string) => void;

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

      customDestinations: [],
      addCustomDestination: (dest) =>
        set((state) => {
          const cleanLabel = dest.label.trim();
          if (!cleanLabel) return state;
          const nextDest: CommuteDestination = {
            label: cleanLabel,
            latitude: dest.latitude,
            longitude: dest.longitude,
          };
          const inPresets = WORKPLACE_PRESETS.some((p) => p.label === cleanLabel);
          const customDestinations = inPresets
            ? state.customDestinations
            : [nextDest, ...state.customDestinations.filter((d) => d.label !== cleanLabel)].slice(0, 12);
          return { commuteDest: nextDest, customDestinations };
        }),
      removeCustomDestination: (label) =>
        set((state) => {
          const customDestinations = state.customDestinations.filter((d) => d.label !== label);
          const commuteDest =
            state.commuteDest.label === label
              ? customDestinations[0] ?? WORKPLACE_PRESETS[0]
              : state.commuteDest;
          return { customDestinations, commuteDest };
        }),

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

