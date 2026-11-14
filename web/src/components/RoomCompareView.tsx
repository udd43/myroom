"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Award, Link2, ShieldAlert, TrainFront, Unlink2 } from "lucide-react";
import { CommuteInfo, RoomItem } from "@/types/room";
import RoomViewer from "./RoomViewer";
import type { SyncedOrbitState } from "./VolumetricRoomViewer";
import { CHECKLIST, GRADES, checklistScore } from "@/lib/checklist";
import { effectiveMonthlyCost, man, monthlyTotal, priceLine, sqm } from "@/lib/format";
import { api } from "@/lib/api";
import { analyzeDailySunlight, getCurrentDayOfYear, resolveRoomLocation } from "@/lib/sunlight";
import { useAppStore } from "@/store/useAppStore";
import CommuteDestPicker from "./CommuteDestPicker";

interface Props {
  rooms: RoomItem[];
  apiBaseUrl: string;
}

type WeightPreset = "balanced" | "budget" | "commute" | "sunlight";

const WEIGHT_CONFIG: Record<
  WeightPreset,
  { label: string; wCost: number; wCommute: number; wSun: number; wCheck: number }
> = {
  balanced: { label: "균형 추천", wCost: 0.35, wCommute: 0.25, wSun: 0.2, wCheck: 0.2 },
  budget: { label: "가성비 우선", wCost: 0.55, wCommute: 0.15, wSun: 0.15, wCheck: 0.15 },
  commute: { label: "출퇴근 우선", wCost: 0.2, wCommute: 0.5, wSun: 0.15, wCheck: 0.15 },
  sunlight: { label: "일조·컨디션", wCost: 0.15, wCommute: 0.15, wSun: 0.35, wCheck: 0.35 },
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateFallbackCommute(room: RoomItem, destLat: number, destLon: number, destLabel: string): CommuteInfo {
  const loc = resolveRoomLocation(room);
  const km = haversineKm(loc.lat, loc.lon, destLat, destLon);
  const mins = Math.max(8, Math.round(km * 3.1 + 11));
  return {
    configured: false,
    provider: "haversine_estimate",
    isEstimate: true,
    destLabel,
    straightKm: +km.toFixed(2),
    totalMinutes: mins,
    routeSummary: `직선거리 ${km.toFixed(1)}km 기준 추정 대중교통 소요`,
  };
}

function Picker({
  label,
  value,
  rooms,
  onChange,
}: {
  label: string;
  value: string;
  rooms: RoomItem[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title} · {priceLine(r)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 값이 더 나은 쪽에 굵게 표시 */
function Row({
  k,
  a,
  b,
  winner,
}: {
  k: string;
  a: React.ReactNode;
  b: React.ReactNode;
  winner?: "a" | "b" | null;
}) {
  const cls = (side: "a" | "b") => (winner === side ? "font-bold text-accent" : "");
  return (
    <div className="grid grid-cols-[1fr_104px_1fr] items-center gap-2 border-b border-line py-2 text-sm">
      <div className={`num ${cls("a")}`}>{a}</div>
      <div className="text-center text-xs text-mute">{k}</div>
      <div className={`num text-right ${cls("b")}`}>{b}</div>
    </div>
  );
}

const lower = (a: number, b: number) => (a === b ? null : a < b ? "a" : "b");
const higher = (a: number, b: number) => (a === b ? null : a > b ? "a" : "b");

export default function RoomCompareView({ rooms, apiBaseUrl }: Props) {
  const [aId, setAId] = useState(rooms[0].id);
  const [bId, setBId] = useState((rooms[1] ?? rooms[0]).id);
  const [sync, setSync] = useState(true);
  const [orbit, setOrbit] = useState<SyncedOrbitState | null>(null);
  const [weightPreset, setWeightPreset] = useState<WeightPreset>("balanced");
  const [commuteMap, setCommuteMap] = useState<Record<string, CommuteInfo>>({});

  const loanRatePct = useAppStore((s) => s.loanRatePct);
  const setLoanRatePct = useAppStore((s) => s.setLoanRatePct);
  const commuteDest = useAppStore((s) => s.commuteDest);

  useEffect(() => {
    let cancelled = false;
    if (!apiBaseUrl) return;
    (async () => {
      const results = await Promise.all(
        rooms.map(async (r) => {
          const loc = resolveRoomLocation(r);
          try {
            const c = await api.getCommute(apiBaseUrl, {
              originLat: loc.lat,
              originLng: loc.lon,
              destLat: commuteDest.latitude,
              destLng: commuteDest.longitude,
              destLabel: commuteDest.label,
            });
            return [r.id, c] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, CommuteInfo> = {};
      for (const item of results) {
        if (item) next[item[0]] = item[1];
      }
      if (Object.keys(next).length > 0) setCommuteMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms, apiBaseUrl, commuteDest.latitude, commuteDest.longitude, commuteDest.label]);

  const dayOfYear = getCurrentDayOfYear();
  const weights = WEIGHT_CONFIG[weightPreset];

  // 전체 매물 종합 랭킹 계산
  const rankedRows = useMemo(() => {
    const base = rooms.map((r) => {
      const effCost = effectiveMonthlyCost(r, loanRatePct);
      const commute =
        commuteMap[r.id] ??
        estimateFallbackCommute(r, commuteDest.latitude, commuteDest.longitude, commuteDest.label);
      const sun = analyzeDailySunlight(r, dayOfYear, true);
      const check = checklistScore(r.checklist);
      const reg = r.propertyIntel?.buildingRegistry;
      const hasRisk = Boolean(reg?.hasViolation || reg?.isNeighborhoodLiving);
      return {
        room: r,
        effCost,
        commuteMin: commute.totalMinutes,
        commuteIsEst: commute.isEstimate,
        sunHoursAvg: +(sun.winterHours * 0.6 + sun.equinoxHours * 0.4).toFixed(1),
        sun,
        check,
        hasRisk,
      };
    });

    const minCost = Math.min(...base.map((x) => x.effCost));
    const maxCost = Math.max(...base.map((x) => x.effCost));
    const minCom = Math.min(...base.map((x) => x.commuteMin));
    const maxCom = Math.max(...base.map((x) => x.commuteMin));
    const maxSun = Math.max(1, ...base.map((x) => x.sunHoursAvg));

    return base
      .map((x) => {
        const costScore = maxCost === minCost ? 100 : ((maxCost - x.effCost) / (maxCost - minCost)) * 100;
        const commuteScore = maxCom === minCom ? 100 : ((maxCom - x.commuteMin) / (maxCom - minCom)) * 100;
        const sunScore = (x.sunHoursAvg / maxSun) * 100;
        const riskPenalty = x.hasRisk ? 12 : 0;
        const total = Math.max(
          0,
          Math.round(
            costScore * weights.wCost +
              commuteScore * weights.wCommute +
              sunScore * weights.wSun +
              x.check * weights.wCheck -
              riskPenalty
          )
        );
        return { ...x, totalScore: total };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [rooms, loanRatePct, commuteMap, commuteDest, dayOfYear, weights]);

  const A = rooms.find((r) => r.id === aId) ?? rooms[0];
  const B = rooms.find((r) => r.id === bId) ?? rooms[0];
  const rowA = rankedRows.find((r) => r.room.id === A.id) ?? rankedRows[0];
  const rowB = rankedRows.find((r) => r.room.id === B.id) ?? rankedRows[0];
  const locA = resolveRoomLocation(A);
  const locB = resolveRoomLocation(B);

  const viewer = (room: RoomItem) => (
    <div className="h-[340px] sm:h-[420px]">
      <RoomViewer
        key={room.id}
        room={room}
        apiBaseUrl={apiBaseUrl}
        compact
        readOnly
        syncedCamera={sync ? orbit : null}
        onCameraSyncChange={sync ? setOrbit : undefined}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 실질 주거비 · 출퇴근 조건 설정 및 종합 랭킹 */}
      <section className="border border-ink bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-bold text-ink">실질 주거비 · 출퇴근 · 일조 종합 랭킹</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 border border-line bg-paper px-2 py-1">
              <span className="text-mute">대출/기회금리</span>
              <input
                type="number"
                step="0.2"
                min="0"
                max="15"
                value={loanRatePct}
                onChange={(e) => setLoanRatePct(Number(e.target.value) || 0)}
                className="num w-12 bg-transparent font-bold text-ink outline-none"
              />
              <span>%</span>
            </label>

            <CommuteDestPicker
              apiBase={apiBaseUrl}
              serverOnline={Boolean(apiBaseUrl)}
              prefix="출퇴근: "
              align="left"
            />

            <div className="flex flex-wrap gap-1">
              {(Object.keys(WEIGHT_CONFIG) as WeightPreset[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setWeightPreset(k)}
                  className={weightPreset === k ? "btn-solid px-2 py-1 text-xs" : "btn-line px-2 py-1 text-xs"}
                >
                  {WEIGHT_CONFIG[k].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-ink text-mute">
                <th className="py-1.5 pr-2">순위</th>
                <th className="py-1.5 pr-2">매물명</th>
                <th className="py-1.5 pr-2 text-right">실질 월 주거비</th>
                <th className="py-1.5 pr-2 text-right">출퇴근</th>
                <th className="py-1.5 pr-2 text-right">동지 일조</th>
                <th className="py-1.5 pr-2 text-right">체크점수</th>
                <th className="py-1.5 pr-2 text-right">종합 점수</th>
                <th className="py-1.5 text-right">비교 선택</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rankedRows.map((row, idx) => (
                <tr key={row.room.id} className={idx === 0 ? "bg-amber-50/60" : ""}>
                  <td className="num py-2 pr-2 font-bold">
                    {idx === 0 ? <span className="bg-accent px-1.5 py-0.5 text-white">1위</span> : `${idx + 1}위`}
                  </td>
                  <td className="py-2 pr-2 font-semibold text-ink">
                    <div className="flex items-center gap-1.5">
                      <span>{row.room.title}</span>
                      {row.hasRisk && (
                        <span className="inline-flex items-center gap-0.5 bg-danger px-1 text-[10px] text-white">
                          <ShieldAlert className="h-2.5 w-2.5" /> 건축물 주의
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num py-2 pr-2 text-right font-semibold text-ink">
                    {row.effCost.toFixed(1)}만원
                  </td>
                  <td className="num py-2 pr-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <TrainFront className="h-3 w-3 text-mute" />
                      {row.commuteMin}분
                      {row.commuteIsEst ? " (추정)" : ""}
                    </span>
                  </td>
                  <td className="num py-2 pr-2 text-right">{row.sun.winterHours.toFixed(1)}h</td>
                  <td className="num py-2 pr-2 text-right">{row.check}</td>
                  <td className="num py-2 pr-2 text-right font-bold text-accent">{row.totalScore}점</td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setAId(row.room.id)}
                        className={A.id === row.room.id ? "btn-solid px-1.5 py-0.5 text-[11px]" : "btn-line px-1.5 py-0.5 text-[11px]"}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => setBId(row.room.id)}
                        className={B.id === row.room.id ? "btn-solid px-1.5 py-0.5 text-[11px]" : "btn-line px-1.5 py-0.5 text-[11px]"}
                      >
                        B
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-mute">
          * 실질 월 주거비 = 보증금 × 연 {loanRatePct.toFixed(1)}% ÷ 12개월 + 월세 + 관리비 기준 산출
        </p>
      </section>

      {/* A vs B 3D 동기화 비교 */}
      <div className="flex flex-wrap items-end gap-3">
        <Picker label="비교 A" value={A.id} rooms={rooms} onChange={setAId} />
        <Picker label="비교 B" value={B.id} rooms={rooms} onChange={setBId} />
        <button onClick={() => setSync((v) => !v)} className={sync ? "btn-solid" : "btn-line"}>
          {sync ? <Link2 className="h-3.5 w-3.5" /> : <Unlink2 className="h-3.5 w-3.5" />}
          시점 {sync ? "연동" : "개별"}
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {viewer(A)}
        {viewer(B)}
      </div>

      <div className="border-t border-ink">
        <Row k="이름" a={A.title} b={B.title} />
        <Row
          k="종합 점수"
          a={`${rowA.totalScore}점`}
          b={`${rowB.totalScore}점`}
          winner={higher(rowA.totalScore, rowB.totalScore)}
        />
        <Row
          k="실질 월 주거비"
          a={`${rowA.effCost.toFixed(1)}만원`}
          b={`${rowB.effCost.toFixed(1)}만원`}
          winner={lower(rowA.effCost, rowB.effCost)}
        />
        <Row
          k="출퇴근 시간"
          a={`${rowA.commuteMin}분`}
          b={`${rowB.commuteMin}분`}
          winner={lower(rowA.commuteMin, rowB.commuteMin)}
        />
        <Row k="보증금(만)" a={man(A.deposit)} b={man(B.deposit)} winner={lower(A.deposit, B.deposit)} />
        <Row
          k="월 고정비(만)"
          a={`${monthlyTotal(A)}`}
          b={`${monthlyTotal(B)}`}
          winner={lower(monthlyTotal(A), monthlyTotal(B))}
        />
        <Row
          k="전용"
          a={`${A.areaPyeong}평 · ${sqm(A.areaPyeong)}㎡`}
          b={`${B.areaPyeong}평 · ${sqm(B.areaPyeong)}㎡`}
          winner={higher(A.areaPyeong, B.areaPyeong)}
        />
        <Row k="구조" a={A.roomStructure} b={B.roomStructure} />
        <Row k="층 · 향" a={`${A.floor} · ${A.direction}`} b={`${B.floor} · ${B.direction}`} />
        <Row k="위치 기준" a={locA.label} b={locB.label} />
        <Row
          k="채광 · 일조"
          a={`${rowA.sun.grade} (동지 ${rowA.sun.winterHours.toFixed(1)}h · 춘추 ${rowA.sun.equinoxHours.toFixed(1)}h)`}
          b={`${rowB.sun.grade} (동지 ${rowB.sun.winterHours.toFixed(1)}h · 춘추 ${rowB.sun.equinoxHours.toFixed(1)}h)`}
          winner={higher(rowA.sun.winterHours + rowA.sun.equinoxHours, rowB.sun.winterHours + rowB.sun.equinoxHours)}
        />
        <Row k="체크 점수" a={rowA.check} b={rowB.check} winner={higher(rowA.check, rowB.check)} />
        {CHECKLIST.map(({ key, label }) => {
          const ga = GRADES.find((g) => g.value === A.checklist[key])!;
          const gb = GRADES.find((g) => g.value === B.checklist[key])!;
          return (
            <Row
              key={key}
              k={label}
              a={<span className={ga.text}>{ga.label}</span>}
              b={<span className={gb.text}>{gb.label}</span>}
            />
          );
        })}
        <Row k="장점" a={A.pros || "—"} b={B.pros || "—"} />
        <Row k="단점" a={A.cons || "—"} b={B.cons || "—"} />
        <Row k="메모" a={A.memo || "—"} b={B.memo || "—"} />
      </div>
    </div>
  );
}
