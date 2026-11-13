"use client";

import { useEffect, useMemo, useState } from "react";
import { RoomItem } from "@/types/room";
import { computeRoomSunState, RoomSunState, SEASON_PRESETS } from "@/lib/sunlight";
import { SunlightParams } from "@/components/SunlightControlBar";

export function useSunlightState(room: RoomItem, initialEnabled = true) {
  const [params, setParams] = useState<SunlightParams>({
    enabled: initialEnabled,
    season: "today",
    minutesOfDay: 13 * 60 + 30, // 오후 13:30 기본 시뮬레이션
    considerObstruction: true,
  });
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setParams((cur) => {
        const nextMin = cur.minutesOfDay + 15;
        return {
          ...cur,
          enabled: true,
          minutesOfDay: nextMin > 19 * 60 + 30 ? 6 * 60 : nextMin,
        };
      });
    }, 180);
    return () => clearInterval(timer);
  }, [playing]);

  const dayOfYear = useMemo(() => {
    return SEASON_PRESETS.find((s) => s.id === params.season)?.dayOfYear ?? 80;
  }, [params.season]);

  const sunState: RoomSunState = useMemo(() => {
    return computeRoomSunState(room, {
      dayOfYear,
      minutesOfDay: params.minutesOfDay,
      considerObstruction: params.considerObstruction,
    });
  }, [room, dayOfYear, params.minutesOfDay, params.considerObstruction]);

  const updateParams = (patch: Partial<SunlightParams>) =>
    setParams((cur) => ({ ...cur, ...patch }));

  return {
    params,
    dayOfYear,
    sunState,
    playing,
    setPlaying,
    togglePlay: () => setPlaying((p) => !p),
    updateParams,
  };
}

