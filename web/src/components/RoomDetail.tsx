"use client";

import React, { useMemo, useState } from "react";
import { Box, Compass, FileUp, Layers, LocateFixed, Smartphone, Sun } from "lucide-react";
import { FurnitureItem, RoomItem, RoomPin } from "@/types/room";
import RoomViewer from "./RoomViewer";
import RoomPlan2DView from "./RoomPlan2DView";
import { CHECKLIST, GRADES, checklistScore } from "@/lib/checklist";
import { engineLabel, man, monthlyTotal, sqm } from "@/lib/format";
import {
  analyzeDailySunlight,
  computeSolarDayEvents,
  DIRECTION_OPTIONS,
  formatMinutesToHHMM,
  KOREA_LOCATION_PRESETS,
  OTHER_KOREA_LOCATION_PRESETS,
  resolveRoomLocation,
  SEASON_PRESETS,
  SeasonPresetId,
  SEOUL_DISTRICT_PRESETS,
} from "@/lib/sunlight";
import { requestBrowserGpsLocation, resolveAddressToCoords } from "@/lib/locationClient";

interface Props {
  room: RoomItem;
  apiBaseUrl: string;
  onAddPin: (pin: Omit<RoomPin, "id">) => void;
  onUpdateFurnitures: (items: FurnitureItem[]) => void;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
  onUploadScanFile: (file: File) => Promise<void>;
}

function Spec({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm">
      <dt className="text-mute">{k}</dt>
      <dd className="num text-right font-medium text-ink">{v}</dd>
    </div>
  );
}

export default function RoomDetail({
  room,
  apiBaseUrl,
  onAddPin,
  onUpdateFurnitures,
  onUpdateRoom,
  onUploadScanFile,
}: Props) {
  const [viewTab, setViewTab] = useState<"3d" | "2d">("3d");
  const [uploading, setUploading] = useState(false);

  const usdzHref = room.usdzUrl
    ? room.usdzUrl.startsWith("http")
      ? room.usdzUrl
      : `${apiBaseUrl}${room.usdzUrl}`
    : null;

  return (
    <div className="space-y-4">
      {/* 상단 뷰 전환 바: 3D 뷰 / Apple RoomPlan 2D 도면 / iOS AR Quick Look / 스캔 파일 업로드 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewTab("3d")}
            className={viewTab === "3d" ? "btn-solid" : "btn-line"}
          >
            <Box className="h-3.5 w-3.5" /> 3D 공간 · 가구 배치
          </button>
          <button
            type="button"
            onClick={() => setViewTab("2d")}
            className={viewTab === "2d" ? "btn-solid" : "btn-line"}
          >
            <Layers className="h-3.5 w-3.5" /> 2D 건축 도면 (RoomPlan)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {usdzHref && (
            <a rel="ar" href={usdzHref} className="btn-solid">
              <Smartphone className="h-3.5 w-3.5" /> iPhone AR로 띄우기
            </a>
          )}
          <label className="btn-line cursor-pointer">
            <FileUp className="h-3.5 w-3.5" />
            <span>{uploading ? "업로드 중…" : "LiDAR(.glb/.usdz/.json) · 영상 교체"}</span>
            <input
              type="file"
              accept=".glb,.usdz,.json,.splat,.ply,video/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  await onUploadScanFile(f);
                  if (f.name.toLowerCase().endsWith(".json")) setViewTab("2d");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* 메인 뷰어 영역 */}
      {room.status !== "ready" && viewTab === "3d" ? (
        <div className="border border-line bg-card p-8 text-sm text-mute">
          {room.status === "processing" ? `변환 중 ${room.progress}% — ` : ""}
          {room.stageText}
        </div>
      ) : viewTab === "2d" ? (
        <div className="min-h-[420px]">
          <RoomPlan2DView room={room} onUpdateRoom={onUpdateRoom} />
        </div>
      ) : (
        <div className="h-[62vh] min-h-[380px] sm:h-[560px]">
          <RoomViewer
            room={room}
            apiBaseUrl={apiBaseUrl}
            onAddPin={onAddPin}
            onUpdateFurnitures={onUpdateFurnitures}
            onUpdateRoom={onUpdateRoom}
          />
        </div>
      )}
    </div>
  );
}

/** 첫 화면 사이드바+뷰어 아래 전체 폭으로 배치되는 건축 스펙 · 체크리스트 · 채광 분석 섹션 */
export function RoomAnalysisSection({
  room,
  onUpdateRoom,
}: {
  room: RoomItem;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
}) {
  const [locatingGps, setLocatingGps] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<SeasonPresetId>("today");

  const sunLocation = useMemo(() => resolveRoomLocation(room), [room]);
  const selectedSeason = useMemo(
    () => SEASON_PRESETS.find((s) => s.id === seasonId) ?? SEASON_PRESETS[0],
    [seasonId]
  );
  const dailySun = useMemo(
    () => analyzeDailySunlight(room, selectedSeason.dayOfYear, true),
    [room, selectedSeason.dayOfYear]
  );
  const solarEvents = useMemo(
    () => computeSolarDayEvents(selectedSeason.dayOfYear, sunLocation.lat, sunLocation.lon),
    [selectedSeason.dayOfYear, sunLocation.lat, sunLocation.lon]
  );

  const requestGps = async () => {
    setLocatingGps(true);
    setLocError(null);
    const res = await requestBrowserGpsLocation();
    setLocatingGps(false);
    if (res.ok) {
      onUpdateRoom?.({
        latitude: res.latitude,
        longitude: res.longitude,
        locationLabel: res.locationLabel,
      });
    } else {
      setLocError(res.message);
    }
  };

  const lookupAddressCoords = async () => {
    if (!room.address?.trim()) return;
    setGeocoding(true);
    setLocError(null);
    const hit = await resolveAddressToCoords(room.address);
    setGeocoding(false);
    if (hit) {
      onUpdateRoom?.({
        latitude: hit.latitude,
        longitude: hit.longitude,
        locationLabel: hit.locationLabel,
      });
    } else {
      setLocError("주소 좌표를 찾지 못했습니다. 아래 서울 구/지역 선택에서 지정해 주세요.");
    }
  };

  return (
    <section className="mt-6 space-y-6 border-t border-ink pt-6">
      {/* 건축 스펙 시트 & 체크리스트 */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-ink">{room.title}</h2>
            <span className="text-xs font-medium text-mute">{engineLabel(room.engine)}</span>
          </div>
          <p className="mb-3 text-xs text-mute">{room.address}</p>
          <dl>
            <Spec k="보증금" v={`${man(room.deposit)}만`} />
            <Spec
              k="월세 + 관리비"
              v={`${room.monthlyRent} + ${room.maintenanceFee} = ${monthlyTotal(room)}만`}
            />
            <Spec k="전용" v={`${room.areaPyeong}평 / ${sqm(room.areaPyeong)}㎡`} />
            <Spec k="구조" v={room.roomStructure} />
            <Spec k="층 · 향" v={`${room.floor} · ${room.direction}`} />
          </dl>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-bold text-ink">현장 체크</h3>
            <span className="num text-sm font-bold text-ink">
              {checklistScore(room.checklist)}
              <span className="text-xs font-normal text-mute"> / 100</span>
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-x-4">
            {CHECKLIST.map(({ key, label }) => {
              const g = GRADES.find((x) => x.value === room.checklist[key])!;
              return (
                <li key={key} className="flex justify-between border-b border-line py-1.5 text-sm">
                  <span className="text-mute">{label}</span>
                  <span className={`font-semibold ${g.text}`}>{g.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* 위치 · 방위 기반 채광 일조 분석 카드 */}
      <div className="border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-bold text-ink">위치 · 방위 기반 채광 분석</h3>
            <span
              className={`text-xs font-bold ${
                dailySun.grade === "최상"
                  ? "text-ok"
                  : dailySun.grade === "간접광 위주"
                    ? "text-bad"
                    : "text-warn"
              }`}
            >
              {dailySun.grade}
            </span>
          </div>
          <span className="num text-xs text-mute">{dailySun.summaryLine}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">
              위치: {sunLocation.label}
            </span>
            <span className="num text-mute">
              ({sunLocation.lat.toFixed(3)}°N, {sunLocation.lon.toFixed(3)}°E ·{" "}
              {sunLocation.source === "gps_saved"
                ? "지정 좌표"
                : sunLocation.source === "address"
                  ? "서울/지역 주소 매핑"
                  : "서울 기본 기준"}
              )
            </span>
            <button
              type="button"
              onClick={requestGps}
              disabled={locatingGps}
              className="btn-line py-1 text-xs"
            >
              <LocateFixed className="h-3.5 w-3.5" />
              <span>{locatingGps ? "측정 중…" : "내 위치(GPS)"}</span>
            </button>
            {room.address && (
              <button
                type="button"
                onClick={lookupAddressCoords}
                disabled={geocoding}
                className="btn-line py-1 text-xs"
              >
                <span>{geocoding ? "조회 중…" : "주소 좌표 적용"}</span>
              </button>
            )}
            <select
              value=""
              onChange={(e) => {
                const p = KOREA_LOCATION_PRESETS.find((x) => x.id === e.target.value);
                if (p) {
                  setLocError(null);
                  onUpdateRoom?.({
                    latitude: p.lat,
                    longitude: p.lon,
                    locationLabel: p.label,
                  });
                }
              }}
              className="input w-auto py-1 text-xs"
              aria-label="지역 기준 선택"
            >
              <option value="">서울 구·지역 선택…</option>
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
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 flex items-center gap-1 text-mute">
              <Compass className="h-3.5 w-3.5" /> 향:
            </span>
            {DIRECTION_OPTIONS.map((d) => {
              const active = (room.direction || "").trim() === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onUpdateRoom?.({ direction: d })}
                  className={active ? "btn-solid px-2 py-0.5 text-xs" : "btn-line px-2 py-0.5 text-xs"}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-2 text-xs">
          <span className="num text-mute">
            {selectedSeason.shortLabel} 기준 태양 궤적: 일출 {formatMinutesToHHMM(solarEvents.sunriseMin)} · 남중{" "}
            {formatMinutesToHHMM(solarEvents.solarNoonMin)} (최고 고도 {solarEvents.maxAltitudeDeg}°) · 일몰{" "}
            {formatMinutesToHHMM(solarEvents.sunsetMin)} · 낮 길이 {solarEvents.dayLengthHours.toFixed(1)}시간
          </span>
          {locError && <span className="text-warn">{locError}</span>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="border border-line bg-paper p-2.5">
            <div className="text-mute">{selectedSeason.label}</div>
            <div className="num mt-0.5 text-sm font-bold text-ink">{dailySun.directHours.toFixed(1)}시간</div>
          </div>
          <div className="border border-line bg-paper p-2.5">
            <div className="text-mute">동지 (12/22)</div>
            <div className="num mt-0.5 text-sm font-bold text-ink">{dailySun.winterHours.toFixed(1)}시간</div>
          </div>
          <div className="border border-line bg-paper p-2.5">
            <div className="text-mute">춘·추분 (3/21)</div>
            <div className="num mt-0.5 text-sm font-bold text-ink">{dailySun.equinoxHours.toFixed(1)}시간</div>
          </div>
          <div className="border border-line bg-paper p-2.5">
            <div className="text-mute">하지 (6/21)</div>
            <div className="num mt-0.5 text-sm font-bold text-ink">{dailySun.summerHours.toFixed(1)}시간</div>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-ink">시간대별 직사광 분포 ({selectedSeason.shortLabel} 기준)</span>
            <div className="flex gap-1">
              {SEASON_PRESETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeasonId(s.id)}
                  className={seasonId === s.id ? "btn-solid px-2 py-0.5 text-xs" : "btn-line px-2 py-0.5 text-xs"}
                >
                  {s.shortLabel}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:[grid-template-columns:repeat(14,minmax(0,1fr))]">
            {dailySun.hourly.map((h) => {
              const barPct = h.directFactor > 0 ? Math.max(22, Math.round(h.directFactor * 100)) : 12;
              return (
                <div
                  key={h.hour}
                  className="flex flex-col items-center gap-1 border border-line bg-paper p-1"
                  title={`${h.label} · 태양고도 ${h.altitudeDeg}° · ${h.inView ? "직사광" : "간접광"}`}
                >
                  <div className="flex h-7 w-full items-end bg-slate-200/80">
                    <div
                      className={`w-full ${h.inView ? "bg-amber-600" : "bg-slate-300"}`}
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                  <span className="num text-[11px] text-ink">{h.hour}시</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(room.pros || room.cons || room.memo) && (
        <div className="grid gap-px border border-line bg-line text-sm sm:grid-cols-3">
          {[
            ["장점", room.pros],
            ["단점", room.cons],
            ["메모", room.memo],
          ].map(([k, v]) => (
            <div key={k} className="bg-card p-3">
              <div className="mb-1 text-xs font-semibold text-mute">{k}</div>
              <p className="text-ink">{v || "—"}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
