"use client";

import React, { useMemo, useRef, useState } from "react";
import { Download, LocateFixed, Pause, Play, Sun } from "lucide-react";
import { RoomItem, RoomPlanData } from "@/types/room";
import {
  analyzeDailySunlight,
  computeWindowFloorSunPolygons,
  DIRECTION_OPTIONS,
  formatMinutesToHHMM,
  KOREA_LOCATION_PRESETS,
  OTHER_KOREA_LOCATION_PRESETS,
  SEASON_PRESETS,
  SeasonPresetId,
  SEOUL_DISTRICT_PRESETS,
} from "@/lib/sunlight";
import { requestBrowserGpsLocation } from "@/lib/locationClient";
import { useSunlightState } from "@/hooks/useSunlightState";

interface Props {
  room: RoomItem;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
}

const FALLBACK_PLAN: RoomPlanData = {
  source: "estimated_floorplan",
  widthM: 5.4,
  depthM: 4.5,
  ceilingHeightM: 2.5,
  walls: [
    { id: "w1", x1: -2.7, z1: -2.25, x2: 2.7, z2: -2.25, lengthM: 5.4, heightM: 2.5 },
    { id: "w2", x1: 2.7, z1: -2.25, x2: 2.7, z2: 2.25, lengthM: 4.5, heightM: 2.5 },
    { id: "w3", x1: 2.7, z1: 2.25, x2: -2.7, z2: 2.25, lengthM: 5.4, heightM: 2.5 },
    { id: "w4", x1: -2.7, z1: 2.25, x2: -2.7, z2: -2.25, lengthM: 4.5, heightM: 2.5 },
  ],
  openings: [
    { id: "win-1", type: "window", x: 0, z: -2.25, widthM: 2.2, rotationDeg: 0 },
    { id: "door-1", type: "door", x: -1.8, z: 2.25, widthM: 0.9, rotationDeg: 0 },
  ],
  objects: [],
};

export default function RoomPlan2DView({ room, onUpdateRoom }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [locating, setLocating] = useState(false);
  const plan = room.roomPlan || FALLBACK_PLAN;
  const furnitures = room.furnitures || [];
  const { params, dayOfYear, sunState, playing, togglePlay, updateParams } = useSunlightState(room, true);

  const requestGps = async () => {
    setLocating(true);
    const res = await requestBrowserGpsLocation();
    setLocating(false);
    if (res.ok) {
      onUpdateRoom?.({
        latitude: res.latitude,
        longitude: res.longitude,
        locationLabel: res.locationLabel,
      });
    }
  };
  const daily = useMemo(
    () => analyzeDailySunlight(room, dayOfYear, params.considerObstruction),
    [room, dayOfYear, params.considerObstruction]
  );
  const sunPolygons = useMemo(
    () => (params.enabled ? computeWindowFloorSunPolygons(room, sunState) : []),
    [room, sunState, params.enabled]
  );

  const scale = 72; // 1m = 72px
  const pad = 70;
  const wPx = Math.max(460, Math.round(plan.widthM * scale + pad * 2));
  const hPx = Math.max(380, Math.round(plan.depthM * scale + pad * 2));
  const cx = wPx / 2;
  const cz = hPx / 2;

  const toX = (m: number) => cx + m * scale;
  const toY = (m: number) => cz + m * scale;
  const deltaDeg = sunState.primaryWindowAzimuthDeg - sunState.roomFacingAzimuthDeg;

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const raw = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([raw], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.id}-roomplan-2d.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex h-full min-h-[380px] w-full flex-col justify-between border border-ink bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-ink">Apple RoomPlan 2D 건축 평면도</span>
          <span className="num text-mute">
            외곽 {plan.widthM.toFixed(2)}m × {plan.depthM.toFixed(2)}m · 층고 {plan.ceilingHeightM}m
          </span>
        </div>
        <button type="button" onClick={downloadSvg} className="btn-line">
          <Download className="h-3.5 w-3.5" /> 도면 SVG 저장
        </button>
      </div>

      {/* 2D 평면 채광 컨트롤 스트립 */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border border-line bg-paper px-2.5 py-2 text-xs">
        <button
          type="button"
          onClick={() => updateParams({ enabled: !params.enabled })}
          className={params.enabled ? "btn-solid py-1 text-xs" : "btn-line py-1 text-xs"}
        >
          <Sun className="h-3.5 w-3.5" />
          <span>{params.enabled ? "채광 ON" : "채광 OFF"}</span>
        </button>

        <button
          type="button"
          onClick={togglePlay}
          className="btn-line py-1 text-xs"
          title="하루 태양 경로 애니메이션"
        >
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          <span>{playing ? "정지" : "하루"}</span>
        </button>

        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <span className="num w-11 shrink-0 font-bold text-ink">
            {formatMinutesToHHMM(params.minutesOfDay)}
          </span>
          <input
            type="range"
            min={360}
            max={1170}
            step={15}
            value={params.minutesOfDay}
            onChange={(e) => updateParams({ minutesOfDay: parseInt(e.target.value, 10), enabled: true })}
            className="w-full accent-accent"
            aria-label="2D 도면 채광 시간 선택"
          />
        </div>

        <select
          value={params.season}
          onChange={(e) => updateParams({ season: e.target.value as SeasonPresetId, enabled: true })}
          className="input w-auto py-1 text-xs"
          aria-label="계절 선택"
        >
          {SEASON_PRESETS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={DIRECTION_OPTIONS.includes(room.direction as (typeof DIRECTION_OPTIONS)[number]) ? room.direction : ""}
          onChange={(e) => e.target.value && onUpdateRoom?.({ direction: e.target.value })}
          className="input w-auto py-1 text-xs font-semibold"
          aria-label="2D 도면 향 선택"
        >
          {!DIRECTION_OPTIONS.includes(room.direction as (typeof DIRECTION_OPTIONS)[number]) && (
            <option value="">{room.direction || "남향"}</option>
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
              onUpdateRoom?.({
                latitude: p.lat,
                longitude: p.lon,
                locationLabel: p.label,
              });
            }
          }}
          className="input max-w-[165px] py-1 text-xs"
          aria-label="2D 도면 위치 선택"
        >
          <option value="">
            {sunState.location.label} ({sunState.location.lat.toFixed(2)}°N)
          </option>
          <optgroup label="서울특별시 25개 자치구">
            {SEOUL_DISTRICT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="전국 주요 지역">
            {OTHER_KOREA_LOCATION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        </select>

        <button
          type="button"
          onClick={requestGps}
          disabled={locating}
          className="btn-line py-1 text-xs"
          title="현재 GPS 위치 기반 서울 좌표 적용"
        >
          <LocateFixed className="h-3 w-3" />
          <span>{locating ? "측정" : "GPS"}</span>
        </button>

        <label className="flex cursor-pointer items-center gap-1 text-ink">
          <input
            type="checkbox"
            checked={params.considerObstruction}
            onChange={(e) => updateParams({ considerObstruction: e.target.checked })}
            className="accent-accent"
          />
          <span>층수 차폐</span>
        </label>

        <span
          className={`num ml-auto border px-2 py-0.5 font-semibold ${
            sunState.isDirectSunlight
              ? "border-amber-700/30 bg-amber-100 text-warn"
              : "border-line bg-card text-mute"
          }`}
        >
          {sunState.statusText}
        </span>
      </div>

      <div className="my-2 flex flex-1 items-center justify-center overflow-auto bg-paper p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${wPx} ${hPx}`}
          className="max-h-[460px] w-full max-w-[680px]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="cad-grid" width={scale / 2} height={scale / 2} patternUnits="userSpaceOnUse">
              <path
                d={`M ${scale / 2} 0 L 0 0 0 ${scale / 2}`}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="0.6"
              />
            </pattern>
            <linearGradient id="sun-floor-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde047" stopOpacity="0.62" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.22" />
            </linearGradient>
          </defs>

          <rect width={wPx} height={hPx} fill="#f4f6f9" />
          <rect width={wPx} height={hPx} fill="url(#cad-grid)" />

          {/* 창문 바닥 직사광 투영 패치 (벽체 클리핑 반영) */}
          {sunPolygons.map((sp) => (
            <polygon
              key={`sun-${sp.windowId}`}
              points={sp.polygon.map(([px, pz]) => `${toX(px).toFixed(1)},${toY(pz).toFixed(1)}`).join(" ")}
              fill="url(#sun-floor-fill)"
              stroke="#d97706"
              strokeWidth="1.4"
              strokeDasharray="4 2"
            />
          ))}

          {/* RoomPlan 기본 인식 가구 (연한 슬레이트 점선) */}
          {plan.objects.map((o) => {
            const ow = o.widthM * scale;
            const od = o.depthM * scale;
            const ox = toX(o.x) - ow / 2;
            const oy = toY(o.z) - od / 2;
            return (
              <g key={o.id} transform={`rotate(${o.rotationDeg}, ${toX(o.x)}, ${toY(o.z)})`}>
                <rect
                  x={ox}
                  y={oy}
                  width={ow}
                  height={od}
                  fill="#e2e8f0"
                  stroke="#475569"
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
                <text
                  x={toX(o.x)}
                  y={toY(o.z)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0f172a"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {o.label}
                </text>
              </g>
            );
          })}

          {/* 사용자가 3D로 배치한 내 가구 (오렌지/블루 강조 표시) */}
          {furnitures.map((f) => {
            const fw = f.widthM * scale;
            const fd = f.depthM * scale;
            const fx = toX(f.position[0]);
            const fy = toY(f.position[2]);
            const deg = ((f.rotationY || 0) * 180) / Math.PI;
            return (
              <g key={f.id} transform={`rotate(${deg}, ${fx}, ${fy})`}>
                <rect
                  x={fx - fw / 2}
                  y={fy - fd / 2}
                  width={fw}
                  height={fd}
                  fill={f.color || "#0284c7"}
                  fillOpacity="0.22"
                  stroke={f.color || "#0284c7"}
                  strokeWidth="2"
                />
                <text
                  x={fx}
                  y={fy - 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0f172a"
                  fontSize="10"
                  fontWeight="bold"
                >
                  {f.name}
                </text>
                <text
                  x={fx}
                  y={fy + 9}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#334155"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {Math.round(f.widthM * 100)}×{Math.round(f.depthM * 100)}
                </text>
              </g>
            );
          })}

          {/* 벽체 및 치수 표기 */}
          {plan.walls.map((w) => {
            const x1 = toX(w.x1);
            const y1 = toY(w.z1);
            const x2 = toX(w.x2);
            const y2 = toY(w.z2);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const isHoriz = Math.abs(y1 - y2) < 4;
            return (
              <g key={w.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#0f172a"
                  strokeWidth="7"
                  strokeLinecap="square"
                />
                <rect
                  x={mx - 24}
                  y={my + (isHoriz ? -22 : -8)}
                  width="48"
                  height="15"
                  fill="#ffffff"
                  stroke="#94a3b8"
                  strokeWidth="0.8"
                />
                <text
                  x={mx}
                  y={my + (isHoriz ? -14 : 0)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0f172a"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {w.lengthM.toFixed(2)}m
                </text>
              </g>
            );
          })}

          {/* 창문(Window) 및 문(Door) 기호 */}
          {plan.openings.map((op) => {
            const ox = toX(op.x);
            const oy = toY(op.z);
            const wLen = op.widthM * scale;
            return (
              <g key={op.id} transform={`rotate(${op.rotationDeg}, ${ox}, ${oy})`}>
                {op.type === "window" ? (
                  <>
                    <rect
                      x={ox - wLen / 2}
                      y={oy - 4}
                      width={wLen}
                      height={8}
                      fill="#bae6fd"
                      stroke="#0284c7"
                      strokeWidth="1.6"
                    />
                    <text
                      x={ox}
                      y={oy + 14}
                      textAnchor="middle"
                      fill="#0369a1"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      창 {op.widthM}m
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      x={ox - wLen / 2}
                      y={oy - 4}
                      width={wLen}
                      height={8}
                      fill="#f4f6f9"
                      stroke="#b93800"
                      strokeWidth="1.6"
                    />
                    <path
                      d={`M ${ox - wLen / 2} ${oy} A ${wLen} ${wLen} 0 0 1 ${ox + wLen / 2} ${oy - wLen * 0.65}`}
                      fill="none"
                      stroke="#b93800"
                      strokeWidth="1.2"
                      strokeDasharray="3 2"
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* 현재 태양 위치 및 입사 방향 가이드 (고도 > 0일 때) */}
          {params.enabled &&
            sunState.world.isDaylight &&
            (() => {
              const sunRad = ((sunState.world.azimuthDeg + deltaDeg) * Math.PI) / 180;
              const sunR = Math.min(cx - 28, cz - 28);
              const sx = cx + Math.sin(sunRad) * sunR;
              const sy = cz - Math.cos(sunRad) * sunR;
              const ex = cx + Math.sin(sunRad) * (sunR * 0.55);
              const ey = cz - Math.cos(sunRad) * (sunR * 0.55);
              const labelOffsetY = sy > cz ? -18 : 19;
              return (
                <g>
                  {sunState.isDirectSunlight && (
                    <line
                      x1={sx}
                      y1={sy}
                      x2={ex}
                      y2={ey}
                      stroke="#d97706"
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                    />
                  )}
                  <circle
                    cx={sx}
                    cy={sy}
                    r="10"
                    fill={sunState.isDirectSunlight ? "#f59e0b" : "#94a3b8"}
                    stroke="#0f172a"
                    strokeWidth="1.2"
                  />
                  <text
                    x={sx}
                    y={sy + labelOffsetY}
                    textAnchor="middle"
                    fill="#0f172a"
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    고도 {Math.round(sunState.world.altitudeDeg)}°
                  </text>
                </g>
              );
            })()}

          {/* 우측 상단 진북/동/서/남 나침반 로즈 */}
          {(() => {
            const compX = wPx - 38;
            const compY = 38;
            const dirs: Array<{ az: number; label: string; north?: boolean }> = [
              { az: 0, label: "N", north: true },
              { az: 90, label: "E" },
              { az: 180, label: "S" },
              { az: 270, label: "W" },
            ];
            return (
              <g>
                <circle
                  cx={compX}
                  cy={compY}
                  r="24"
                  fill="#ffffff"
                  fillOpacity="0.94"
                  stroke="#0f172a"
                  strokeWidth="1.2"
                />
                <circle cx={compX} cy={compY} r="2.5" fill="#0f172a" />
                {dirs.map((d) => {
                  const rad = ((d.az + deltaDeg) * Math.PI) / 180;
                  const lx = compX + Math.sin(rad) * 15.5;
                  const ly = compY - Math.cos(rad) * 15.5;
                  return d.north ? (
                    <g key={d.label}>
                      <circle cx={lx} cy={ly} r="7" fill="#b93800" />
                      <text
                        x={lx}
                        y={ly + 0.5}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize="8.5"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        N
                      </text>
                    </g>
                  ) : (
                    <text
                      key={d.label}
                      x={lx}
                      y={ly + 0.5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#334155"
                      fontSize="8.5"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {d.label}
                    </text>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* 시간대별(06~19시) 일조 막대 스트립 */}
      <div className="mb-2 border border-line bg-paper p-2.5 text-xs">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-ink">시간대별 직사 일조 ({daily.grade})</span>
          <span className="num text-mute">
            선택일 {daily.directHours.toFixed(1)}h · 동지 {daily.winterHours.toFixed(1)}h · 춘추분{" "}
            {daily.equinoxHours.toFixed(1)}h · 하지 {daily.summerHours.toFixed(1)}h
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 sm:[grid-template-columns:repeat(14,minmax(0,1fr))]">
          {daily.hourly.map((h) => {
            const activeHour = Math.floor(params.minutesOfDay / 60) === h.hour;
            const barPct = h.directFactor > 0 ? Math.max(22, Math.round(h.directFactor * 100)) : 12;
            return (
              <button
                key={h.hour}
                type="button"
                onClick={() => updateParams({ minutesOfDay: h.hour * 60 + 30, enabled: true })}
                className={`flex flex-col items-center gap-1 border p-1 transition-colors ${
                  activeHour ? "border-ink bg-card font-bold" : "border-transparent bg-card/60 hover:border-line"
                }`}
                title={`${h.label} · 태양고도 ${h.altitudeDeg}° · ${h.inView ? "직사광 유입" : "간접광"}`}
              >
                <div className="flex h-8 w-full items-end bg-slate-200/80">
                  <div
                    className={`w-full ${h.inView ? "bg-amber-600" : "bg-slate-300"}`}
                    style={{ height: `${barPct}%` }}
                  />
                </div>
                <span className="num text-[11px] text-ink">{h.hour}시</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
        <span>격자 1칸 = 50cm × 50cm · 파란선: 창문 · 주황 패치: 직사광 바닥 투영</span>
        <span>3D 뷰에서 배치한 내 가구와 위치·향 설정이 도면 위에도 실시간 반영됩니다</span>
      </div>
    </div>
  );
}

