"use client";

import React, { useState } from "react";
import { Compass, LocateFixed, Pause, Play, Sun, X } from "lucide-react";
import {
  DIRECTION_OPTIONS,
  formatMinutesToHHMM,
  KOREA_LOCATION_PRESETS,
  RoomSunState,
  SEASON_PRESETS,
  SeasonPresetId,
} from "@/lib/sunlight";

export interface SunlightParams {
  enabled: boolean;
  season: SeasonPresetId;
  minutesOfDay: number;
  considerObstruction: boolean;
}

interface Props {
  params: SunlightParams;
  sunState: RoomSunState;
  direction: string;
  playing: boolean;
  onChangeParams: (next: Partial<SunlightParams>) => void;
  onTogglePlay: () => void;
  onUpdateRoomLocationAndDirection?: (patch: {
    direction?: string;
    latitude?: number;
    longitude?: number;
    locationLabel?: string;
  }) => void;
  onClose?: () => void;
}

export default function SunlightControlBar({
  params,
  sunState,
  direction,
  playing,
  onChangeParams,
  onTogglePlay,
  onUpdateRoomLocationAndDirection,
  onClose,
}: Props) {
  const [locating, setLocating] = useState(false);

  const requestGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        onUpdateRoomLocationAndDirection?.({
          latitude: lat,
          longitude: lon,
          locationLabel: `현재 GPS (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="pointer-events-auto flex flex-col gap-1.5 border border-white/25 bg-stage/95 px-2.5 py-2 text-xs text-white shadow-lg backdrop-blur"
    >
      {/* 1행: 시간 슬라이더 + 재생 + 계절 + 상태 배지 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeParams({ enabled: !params.enabled })}
          className={`flex items-center gap-1 px-2 py-1 font-semibold ${
            params.enabled ? "bg-accent text-white" : "bg-white/10 text-white/80"
          }`}
          title="실시간 채광 시뮬레이션 켜기/끄기"
        >
          <Sun className="h-3.5 w-3.5" />
          <span>{params.enabled ? "채광 ON" : "채광 OFF"}</span>
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          className="flex items-center gap-1 border border-white/20 bg-white/10 px-2 py-1 hover:bg-white/20"
          title="하루 태양 이동 애니메이션"
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          <span>{playing ? "정지" : "하루"}</span>
        </button>

        <div className="flex min-w-[150px] flex-1 items-center gap-2">
          <span className="num w-11 shrink-0 font-bold text-amber-300">
            {formatMinutesToHHMM(params.minutesOfDay)}
          </span>
          <input
            type="range"
            min={360}
            max={1170}
            step={15}
            value={params.minutesOfDay}
            onChange={(e) => onChangeParams({ minutesOfDay: parseInt(e.target.value, 10), enabled: true })}
            className="w-full accent-accent"
            aria-label="시간대 선택"
          />
        </div>

        <div className="flex items-center gap-1">
          {SEASON_PRESETS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChangeParams({ season: s.id, enabled: true })}
              className={`px-1.5 py-0.5 text-[11px] font-medium ${
                params.season === s.id
                  ? "bg-white text-ink font-bold"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
              title={s.dateLabel}
            >
              {s.shortLabel}
            </button>
          ))}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 text-white/75 hover:text-white"
            aria-label="채광 패널 닫기"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 2행: 집 향(남향/북향 등) + 위치(GPS/지역) + 차폐 옵션 + 태양 상태 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-1.5 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-white/75">
            <Compass className="h-3 w-3" /> 향:
          </span>
          <select
            value={DIRECTION_OPTIONS.includes(direction as (typeof DIRECTION_OPTIONS)[number]) ? direction : ""}
            onChange={(e) => {
              if (e.target.value) {
                onUpdateRoomLocationAndDirection?.({ direction: e.target.value });
              }
            }}
            className="border border-white/25 bg-stage px-1.5 py-0.5 text-[11px] font-semibold text-white outline-none"
            aria-label="집 향 선택"
          >
            {!DIRECTION_OPTIONS.includes(direction as (typeof DIRECTION_OPTIONS)[number]) && (
              <option value="">{direction || "남향"}</option>
            )}
            {DIRECTION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value=""
            onChange={(e) => {
              const p = KOREA_LOCATION_PRESETS.find((x) => x.id === e.target.value);
              if (p) {
                onUpdateRoomLocationAndDirection?.({
                  latitude: p.lat,
                  longitude: p.lon,
                  locationLabel: p.label,
                });
              }
            }}
            className="max-w-[140px] border border-white/25 bg-stage px-1.5 py-0.5 text-[11px] text-white outline-none"
            aria-label="지역 위치 선택"
          >
            <option value="">
              {sunState.location.label} ({sunState.location.lat.toFixed(2)}°N)
            </option>
            {KOREA_LOCATION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.lat.toFixed(2)}°N)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={requestGps}
            disabled={locating}
            className="flex items-center gap-1 border border-white/25 bg-white/10 px-1.5 py-0.5 hover:bg-white/20 disabled:opacity-50"
            title="브라우저/모바일 GPS 현재 위치 적용"
          >
            <LocateFixed className="h-3 w-3" />
            <span>{locating ? "측정 중" : "GPS"}</span>
          </button>

          <label className="flex cursor-pointer items-center gap-1 pl-1 text-white/85">
            <input
              type="checkbox"
              checked={params.considerObstruction}
              onChange={(e) => onChangeParams({ considerObstruction: e.target.checked })}
              className="accent-accent"
            />
            <span>층수 차폐</span>
          </label>
        </div>

        <span
          className={`px-1.5 py-0.5 font-semibold ${
            sunState.isDirectSunlight
              ? "bg-amber-400/20 text-amber-200"
              : "bg-slate-400/20 text-slate-200"
          }`}
        >
          {sunState.statusText}
        </span>
      </div>
    </div>
  );
}

