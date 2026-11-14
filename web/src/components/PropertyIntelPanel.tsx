"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Coins,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrainFront,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { man } from "@/lib/format";
import { resolveRoomLocation } from "@/lib/sunlight";
import { useAppStore, WORKPLACE_PRESETS } from "@/store/useAppStore";
import { NeighborBuilding, PropertyIntel, RoomItem } from "@/types/room";

interface Props {
  room: RoomItem;
  apiBase: string;
  serverOnline: boolean;
  readOnly?: boolean;
  onUpdateRoom?: (patch: Partial<RoomItem>) => void;
}

function azimuthLabel(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  if (norm < 22.5 || norm >= 337.5) return "북";
  if (norm < 67.5) return "북동";
  if (norm < 112.5) return "동";
  if (norm < 157.5) return "남동";
  if (norm < 202.5) return "남";
  if (norm < 247.5) return "남서";
  if (norm < 292.5) return "서";
  return "북서";
}

export default function PropertyIntelPanel({
  room,
  apiBase,
  serverOnline,
  readOnly = false,
  onUpdateRoom,
}: Props) {
  const loanRatePct = useAppStore((s) => s.loanRatePct);
  const commuteDest = useAppStore((s) => s.commuteDest);
  const setCommuteDest = useAppStore((s) => s.setCommuteDest);

  const [loadingIntel, setLoadingIntel] = useState(false);
  const [loadingVworld, setLoadingVworld] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // 수동 주변 건물 추가 입력
  const [showAddBldg, setShowAddBldg] = useState(false);
  const [bName, setBName] = useState("앞 빌라/오피스텔");
  const [bAzimuthDeg, setBAzimuthDeg] = useState(180);
  const [bDistM, setBDistM] = useState(14);
  const [bHeightM, setBHeightM] = useState(16);

  const intel = room.propertyIntel ?? null;
  const resolvedLoc = useMemo(() => resolveRoomLocation(room), [room]);
  const neighbors = room.neighborBuildings || [];

  const fetchAllIntel = async () => {
    if (!serverOnline || !apiBase || !onUpdateRoom) return;
    setLoadingIntel(true);
    setStatusMsg(null);
    try {
      let bjdong = room.bjdongMeta ?? null;
      let lat = room.latitude ?? resolvedLoc.lat;
      let lng = room.longitude ?? resolvedLoc.lon;
      let locLabel = room.locationLabel;

      // 1) 좌표 또는 법정동 코드가 비어 있으면 주소 검색(Juso + Kakao)으로 먼저 해결
      if ((!bjdong || !room.latitude || !room.longitude) && room.address && room.address !== "—") {
        const searchRes = await api.searchAddress(apiBase, room.address).catch(() => null);
        const firstJuso = searchRes?.juso?.items?.[0];
        const kakao = searchRes?.kakao;
        if (firstJuso) {
          bjdong = {
            admCd: firstJuso.admCd,
            sigunguCd: firstJuso.sigunguCd,
            bjdongCd: firstJuso.bjdongCd,
            bun: firstJuso.bun,
            ji: firstJuso.ji,
            platGbCd: firstJuso.platGbCd,
          };
        }
        if (kakao?.found && typeof kakao.latitude === "number" && typeof kakao.longitude === "number") {
          lat = kakao.latitude;
          lng = kakao.longitude;
          locLabel = kakao.regionLabel || locLabel;
          if (!bjdong && kakao.sigunguCd && kakao.bjdongCd && kakao.bun) {
            bjdong = {
              sigunguCd: kakao.sigunguCd,
              bjdongCd: kakao.bjdongCd,
              bun: kakao.bun,
              ji: kakao.ji || "0000",
            };
          }
        }
      }

      // 2) 건축물대장 · 전월세 실거래가 · 주변 POI · 출퇴근 병렬 호출
      const [regRes, rentRes, poiRes, commuteRes] = await Promise.all([
        bjdong?.sigunguCd && bjdong?.bjdongCd && bjdong?.bun
          ? api.getBuildingRegistry(apiBase, bjdong).catch(() => undefined)
          : Promise.resolve(undefined),
        bjdong?.sigunguCd
          ? api
              .getRentMarket(apiBase, {
                lawdCd: bjdong.sigunguCd,
                deposit: room.deposit,
                monthlyRent: room.monthlyRent,
                areaSqm: +(room.areaPyeong * 3.3058).toFixed(1),
                ratePct: loanRatePct,
              })
              .catch(() => undefined)
          : Promise.resolve(undefined),
        api.getNearbyPoi(apiBase, lat, lng).catch(() => undefined),
        api
          .getCommute(apiBase, {
            originLat: lat,
            originLng: lng,
            destLat: commuteDest.latitude,
            destLng: commuteDest.longitude,
            destLabel: commuteDest.label,
          })
          .catch(() => undefined),
      ]);

      const nextIntel: PropertyIntel = {
        buildingRegistry: regRes ?? intel?.buildingRegistry,
        rentMarket: rentRes ?? intel?.rentMarket,
        nearbyPoi: poiRes ?? intel?.nearbyPoi,
        commute: commuteRes ?? intel?.commute,
        fetchedAt: new Date().toISOString(),
      };

      onUpdateRoom({
        latitude: lat,
        longitude: lng,
        locationLabel: locLabel,
        bjdongMeta: bjdong,
        propertyIntel: nextIntel,
      });
      setStatusMsg("공공데이터 · 카카오 · 대중교통 정보를 최신화했습니다.");
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "외부 API 조회 중 오류가 발생했습니다.");
    } finally {
      setLoadingIntel(false);
    }
  };

  const fetchVworldBuildings = async () => {
    if (!serverOnline || !apiBase || !onUpdateRoom) return;
    setLoadingVworld(true);
    setStatusMsg(null);
    try {
      const lat = room.latitude ?? resolvedLoc.lat;
      const lng = room.longitude ?? resolvedLoc.lon;
      const res = await api.getVworldBuildings(apiBase, lat, lng, 95);
      if (!res.configured) {
        setStatusMsg("VWorld API 키가 서버(.env)에 아직 없어 수동 건물 추가를 이용해주세요.");
      } else if (res.buildings.length === 0) {
        setStatusMsg(res.error || "반경 95m 내 VWorld 3D 건물 데이터가 반환되지 않았습니다.");
      } else {
        const manualOnly = neighbors.filter((n) => n.source === "manual");
        onUpdateRoom({ neighborBuildings: [...manualOnly, ...res.buildings] });
        setStatusMsg(`주변 3D 건물 ${res.buildings.length}동을 일조 그림자에 반영했습니다.`);
      }
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "주변 건물 불러오기에 실패했습니다.");
    } finally {
      setLoadingVworld(false);
    }
  };

  const addManualBuilding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateRoom || readOnly) return;
    const rad = (bAzimuthDeg * Math.PI) / 180;
    const nextB: NeighborBuilding = {
      id: `nb-${Date.now()}`,
      name: bName.trim() || "주변 건물",
      xM: +(bDistM * Math.sin(rad)).toFixed(1),
      zM: +(-bDistM * Math.cos(rad)).toFixed(1),
      widthM: 12,
      depthM: 10,
      heightM: Math.max(3, bHeightM),
      floors: Math.max(1, Math.round(bHeightM / 3)),
      distanceM: bDistM,
      source: "manual",
    };
    onUpdateRoom({ neighborBuildings: [...neighbors, nextB] });
    setShowAddBldg(false);
  };

  const removeNeighbor = (id: string) => {
    if (!onUpdateRoom || readOnly) return;
    onUpdateRoom({ neighborBuildings: neighbors.filter((b) => b.id !== id) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div>
          <span className="label mb-0">부동산 공적장부 · 실거래 · 입지 · 주변건물 일조</span>
          <p className="text-[11px] text-mute">
            기준 좌표: {resolvedLoc.label} ({resolvedLoc.lat.toFixed(4)}°N, {resolvedLoc.lon.toFixed(4)}°E)
            {room.bjdongMeta ? ` · 법정동코드 ${room.bjdongMeta.sigunguCd}-${room.bjdongMeta.bjdongCd}` : ""}
          </p>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={commuteDest.label}
              onChange={(e) => {
                const picked = WORKPLACE_PRESETS.find((p) => p.label === e.target.value);
                if (picked) setCommuteDest(picked);
              }}
              className="input w-auto py-1 text-xs"
              title="출퇴근 기준 목적지"
            >
              {WORKPLACE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  목적지: {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fetchAllIntel}
              disabled={!serverOnline || loadingIntel}
              className="btn-solid py-1 text-xs disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingIntel ? "animate-spin" : ""}`} />
              <span>{loadingIntel ? "조회 중…" : "공공·입지 API 일괄 조회"}</span>
            </button>
          </div>
        )}
      </div>

      {statusMsg && <p className="border border-line bg-paper px-3 py-1.5 text-xs text-ink">{statusMsg}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {/* 1) 건축물대장 (전세사기·근생 불법주거 1차 필터) */}
        <div className="border border-line bg-paper p-3 text-xs">
          <div className="mb-2 flex items-center justify-between font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-accent" />
              건축물대장 (건축HUB)
            </span>
            {intel?.buildingRegistry?.found &&
              (intel.buildingRegistry.hasViolation || intel.buildingRegistry.isNeighborhoodLiving ? (
                <span className="flex items-center gap-1 bg-danger px-2 py-0.5 text-[11px] text-white">
                  <ShieldAlert className="h-3 w-3" /> 주의 필요
                </span>
              ) : (
                <span className="flex items-center gap-1 bg-ok px-2 py-0.5 text-[11px] text-white">
                  <ShieldCheck className="h-3 w-3" /> 주거용 정상
                </span>
              ))}
          </div>

          {!intel?.buildingRegistry ? (
            <p className="text-mute">
              상단 <strong>공공·입지 API 일괄 조회</strong>를 누르면 주용도(근린생활시설 여부), 위반건축물 여부,
              준공연도를 자동으로 확인합니다.
            </p>
          ) : !intel.buildingRegistry.configured ? (
            <p className="text-mute">공공데이터포털 건축물대장 키(`DATA_GO_KR_API_KEY`) 미설정 상태입니다.</p>
          ) : !intel.buildingRegistry.found ? (
            <p className="text-mute">
              {intel.buildingRegistry.error || "해당 지번의 표제부 정보를 찾지 못했습니다. 도로명 상세주소를 확인하세요."}
            </p>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-mute">주용도</span>
                <span className="font-semibold text-ink">{intel.buildingRegistry.mainPurpose || "—"}</span>
                <span className="text-mute">사용승인</span>
                <span className="num text-ink">
                  {intel.buildingRegistry.approvalYear ? `${intel.buildingRegistry.approvalYear}년` : intel.buildingRegistry.approvalDate || "—"}
                </span>
                <span className="text-mute">규모 / 세대</span>
                <span className="num text-ink">
                  지상 {intel.buildingRegistry.groundFloors ?? "?"}층 / {intel.buildingRegistry.householdCount ?? "?"}세대
                </span>
              </div>
              {intel.buildingRegistry.warnings && intel.buildingRegistry.warnings.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-danger/30 pt-1.5 text-[11px] text-danger">
                  {intel.buildingRegistry.warnings.map((w, idx) => (
                    <p key={idx} className="flex items-start gap-1">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2) 전월세 실거래가 시세 비교 */}
        <div className="border border-line bg-paper p-3 text-xs">
          <div className="mb-2 flex items-center justify-between font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-accent" />
              국토부 전월세 실거래가 비교
            </span>
            {intel?.rentMarket?.verdict && (
              <span
                className={`px-2 py-0.5 text-[11px] font-bold ${
                  intel.rentMarket.verdict.includes("비쌈")
                    ? "bg-danger text-white"
                    : intel.rentMarket.verdict.includes("저렴")
                      ? "bg-ok text-white"
                      : "bg-ink text-white"
                }`}
              >
                {intel.rentMarket.verdict.startsWith("평균")
                  ? intel.rentMarket.verdict
                  : `시세 대비 ${intel.rentMarket.verdict}`}{" "}
                {typeof intel.rentMarket.diffPct === "number"
                  ? `(${intel.rentMarket.diffPct > 0 ? "+" : ""}${intel.rentMarket.diffPct}%)`
                  : ""}
              </span>
            )}
          </div>

          {!intel?.rentMarket ? (
            <p className="text-mute">법정동 최근 연립·다세대/오피스텔 전월세 실거래 환산월세와 비교합니다.</p>
          ) : !intel.rentMarket.configured ? (
            <p className="text-mute">공공데이터포털 실거래 API 키(`DATA_GO_KR_API_KEY`)가 필요합니다.</p>
          ) : !intel.rentMarket.sampleCount ? (
            <p className="text-mute">{intel.rentMarket.error || "최근 거래 표본이 부족합니다."}</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap justify-between gap-2 bg-card px-2 py-1.5">
                <span>
                  이 방 환산 <strong className="num">{man(Math.round(intel.rentMarket.targetEquivMonthly ?? 0))}만원</strong>
                </span>
                <span>
                  동네 중위{" "}
                  <strong className="num text-accent">
                    {man(Math.round(intel.rentMarket.medianEquivMonthly ?? 0))}만원
                  </strong>{" "}
                  <span className="text-mute">({intel.rentMarket.sampleCount}건)</span>
                </span>
              </div>
              {intel.rentMarket.recentTrades && intel.rentMarket.recentTrades.length > 0 && (
                <ul className="divide-y divide-line text-[11px]">
                  {intel.rentMarket.recentTrades.slice(0, 3).map((t, i) => (
                    <li key={i} className="flex justify-between py-1">
                      <span className="truncate pr-2 text-ink">
                        [{t.kind}] {t.umdNm} {t.name || ""} · {t.areaSqm}㎡ ({t.floor}층)
                      </span>
                      <span className="num shrink-0 font-medium text-ink">
                        {t.deposit}/{t.monthlyRent}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 3) 역세권/생활 POI + 출퇴근 소요시간 */}
        <div className="border border-line bg-paper p-3 text-xs">
          <div className="mb-2 flex items-center justify-between font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <TrainFront className="h-3.5 w-3.5 text-accent" />
              역세권 · 편의시설 · 출퇴근 소요시간
            </span>
            {intel?.commute && (
              <span className="num bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">
                {intel.commute.destLabel.split(" ")[0]} {intel.commute.totalMinutes}분
              </span>
            )}
          </div>

          {intel?.commute && (
            <div className="mb-2 border border-line bg-card px-2.5 py-1.5">
              <p className="font-semibold text-ink">
                → {intel.commute.destLabel}: <span className="num text-accent">{intel.commute.totalMinutes}분</span>{" "}
                <span className="text-[11px] font-normal text-mute">
                  ({intel.commute.isEstimate ? "직선거리 추정" : `${intel.commute.provider} 실측`})
                </span>
              </p>
              <p className="text-[11px] text-mute">{intel.commute.routeSummary}</p>
            </div>
          )}

          {intel?.nearbyPoi?.configured ? (
            <div className="space-y-1.5">
              {intel.nearbyPoi.subways.length > 0 && (
                <p>
                  <span className="text-mute">지하철: </span>
                  {intel.nearbyPoi.subways
                    .slice(0, 2)
                    .map((s) => `${s.name}(${s.distanceM}m · 도보${s.walkMinutes}분)`)
                    .join(", ")}
                </p>
              )}
              {intel.nearbyPoi.convenienceStores.length > 0 && (
                <p>
                  <span className="text-mute">편의점: </span>
                  {intel.nearbyPoi.convenienceStores[0].name} ({intel.nearbyPoi.convenienceStores[0].distanceM}m)
                </p>
              )}
              {intel.nearbyPoi.marts.length > 0 && (
                <p>
                  <span className="text-mute">마트: </span>
                  {intel.nearbyPoi.marts[0].name} ({intel.nearbyPoi.marts[0].distanceM}m)
                </p>
              )}
            </div>
          ) : (
            <p className="text-mute">
              카카오 REST 키(`KAKAO_REST_API_KEY`)와 ODsay 키(`ODSAY_API_KEY`) 연결 시 가장 가까운 역·편의점·대중교통
              출퇴근 시간이 자동 기록됩니다.
            </p>
          )}
        </div>

        {/* 4) 주변 건물 3D 그림자 일조 차폐 (VWorld + 수동) */}
        <div className="border border-line bg-paper p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-bold text-ink">
            <span>주변 건물 3D 그림자 차폐 ({neighbors.length}동)</span>
            {!readOnly && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={fetchVworldBuildings}
                  disabled={!serverOnline || loadingVworld}
                  className="btn-line py-0.5 text-[11px] disabled:opacity-50"
                >
                  {loadingVworld ? "불러오는 중…" : "VWorld 3D"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBldg((v) => !v)}
                  className="btn-line py-0.5 text-[11px]"
                >
                  <Plus className="h-3 w-3" /> 건물 추가
                </button>
              </div>
            )}
          </div>

          {showAddBldg && !readOnly && (
            <form onSubmit={addManualBuilding} className="mb-2 grid grid-cols-2 gap-1.5 border border-line bg-card p-2">
              <input
                value={bName}
                onChange={(e) => setBName(e.target.value)}
                placeholder="건물 이름"
                className="input col-span-2 py-1 text-xs"
              />
              <label className="text-[11px]">
                방위(0북 90동 180남 270서)
                <input
                  type="number"
                  value={bAzimuthDeg}
                  onChange={(e) => setBAzimuthDeg(Number(e.target.value))}
                  className="input num py-0.5 text-xs"
                />
              </label>
              <label className="text-[11px]">
                거리(m) / 높이(m)
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={3}
                    value={bDistM}
                    onChange={(e) => setBDistM(Number(e.target.value))}
                    className="input num py-0.5 text-xs"
                  />
                  <input
                    type="number"
                    min={3}
                    value={bHeightM}
                    onChange={(e) => setBHeightM(Number(e.target.value))}
                    className="input num py-0.5 text-xs"
                  />
                </div>
              </label>
              <button type="submit" className="btn-solid col-span-2 justify-center py-1 text-xs">
                일조 시뮬레이션에 건물 배치
              </button>
            </form>
          )}

          {neighbors.length === 0 ? (
            <p className="text-mute">
              앞 빌라나 오피스텔 높이를 추가하면 3D·2D 채광 시뮬레이터가 겨울 오후 태양 고도에서 그림자를 직접
              계산해 줍니다.
            </p>
          ) : (
            <ul className="max-h-36 divide-y divide-line overflow-y-auto text-[11px]">
              {neighbors.map((nb) => {
                const az = ((Math.atan2(nb.xM, -nb.zM) * 180) / Math.PI + 360) % 360;
                const dist = nb.distanceM ?? Math.round(Math.hypot(nb.xM, nb.zM));
                return (
                  <li key={nb.id} className="flex items-center justify-between py-1">
                    <span>
                      <strong className="text-ink">{nb.name}</strong>{" "}
                      <span className="num text-mute">
                        ({azimuthLabel(az)}쪽 · 거리 {dist}m · 높이 {Math.round(nb.heightM)}m)
                      </span>
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeNeighbor(nb.id)}
                        className="text-mute hover:text-danger"
                        title="건물 삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
