"use client";

import React, { useMemo, useState } from "react";
import { LocateFixed, Search, X } from "lucide-react";
import { BjdongMeta, NewRoomMeta, Quality, UploadKind } from "@/types/room";
import { api, getApiBaseUrl } from "@/lib/api";
import { CHECKLIST, DEFAULT_CHECKLIST, GRADES } from "@/lib/checklist";
import { DIRECTION_OPTIONS, matchPresetFromText, SEOUL_DISTRICT_PRESETS } from "@/lib/sunlight";
import { requestBrowserGpsLocation, resolveAddressToCoords } from "@/lib/locationClient";

interface Props {
  apiBase?: string;
  serverOnline?: boolean;
  onClose: () => void;
  onSubmit: (meta: NewRoomMeta, file: File | null, kind: UploadKind, quality: Quality) => Promise<void>;
}

interface JusoCandidate {
  roadAddr: string;
  jibunAddr: string;
  bdNm: string;
  admCd: string;
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
}

const EMPTY: NewRoomMeta = {
  title: "",
  address: "",
  dealType: "월세",
  deposit: 2000,
  monthlyRent: 90,
  maintenanceFee: 10,
  areaPyeong: 11,
  roomStructure: "",
  floor: "",
  direction: "",
  pros: "",
  cons: "",
  memo: "",
  checklist: DEFAULT_CHECKLIST,
};

const NUMBER_FIELDS: Array<{ key: "deposit" | "monthlyRent" | "maintenanceFee" | "areaPyeong"; label: string }> = [
  { key: "deposit", label: "보증금(만)" },
  { key: "monthlyRent", label: "월세(만)" },
  { key: "maintenanceFee", label: "관리비(만)" },
  { key: "areaPyeong", label: "전용(평)" },
];

const TEXT_FIELDS: Array<{ key: "roomStructure" | "floor"; label: string; ph: string }> = [
  { key: "roomStructure", label: "구조", ph: "투룸" },
  { key: "floor", label: "층", ph: "4층 / 5층" },
];

const SCAN_EXT = [".glb", ".usdz", ".json", ".splat", ".spz", ".sog", ".ply"];

function kindOf(file: File | null): UploadKind {
  if (!file) return "none";
  return SCAN_EXT.some((e) => file.name.toLowerCase().endsWith(e)) ? "3d" : "video";
}

export default function AddRoomDialog({ apiBase, serverOnline = false, onClose, onSubmit }: Props) {
  const effectiveBase = apiBase ?? getApiBaseUrl();
  const [form, setForm] = useState<NewRoomMeta>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<Quality>("high");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [jusoCandidates, setJusoCandidates] = useState<JusoCandidate[]>([]);

  const set = <K extends keyof NewRoomMeta>(k: K, v: NewRoomMeta[K]) => setForm((f) => ({ ...f, [k]: v }));
  const kind = kindOf(file);
  const inferredLocation = useMemo(
    () => matchPresetFromText(`${form.address} ${form.title}`),
    [form.address, form.title]
  );

  const requestGps = async () => {
    setLocating(true);
    setGeoNotice(null);
    const res = await requestBrowserGpsLocation();
    setLocating(false);
    if (res.ok) {
      setForm((f) => ({
        ...f,
        latitude: res.latitude,
        longitude: res.longitude,
        locationLabel: res.locationLabel,
      }));
    } else {
      setGeoNotice(res.message);
    }
  };

  const applyJusoCandidate = async (cand: JusoCandidate) => {
    setJusoCandidates([]);
    const bjdongMeta: BjdongMeta = {
      admCd: cand.admCd,
      sigunguCd: cand.sigunguCd,
      bjdongCd: cand.bjdongCd,
      bun: cand.bun,
      ji: cand.ji,
      platGbCd: cand.platGbCd,
    };
    setForm((f) => ({
      ...f,
      address: cand.roadAddr || cand.jibunAddr || f.address,
      bjdongMeta,
    }));
    if (serverOnline && effectiveBase) {
      const geo = await api.geocodeKakao(effectiveBase, cand.roadAddr).catch(() => null);
      if (geo?.found && typeof geo.latitude === "number" && typeof geo.longitude === "number") {
        setForm((f) => ({
          ...f,
          latitude: geo.latitude,
          longitude: geo.longitude,
          locationLabel: geo.regionLabel || cand.bdNm || cand.roadAddr,
        }));
        return;
      }
    }
    const osm = await resolveAddressToCoords(cand.roadAddr || cand.jibunAddr);
    if (osm) {
      setForm((f) => ({
        ...f,
        latitude: osm.latitude,
        longitude: osm.longitude,
        locationLabel: osm.locationLabel,
      }));
    }
  };

  const lookupAddressCoords = async () => {
    if (!form.address.trim()) return;
    setGeocoding(true);
    setGeoNotice(null);
    setJusoCandidates([]);
    try {
      if (serverOnline && effectiveBase) {
        const res = await api.searchAddress(effectiveBase, form.address).catch(() => null);
        const items = res?.juso?.items || [];
        const kakao = res?.kakao;
        if (items.length > 1) {
          setJusoCandidates(items.slice(0, 6));
          setGeoNotice("아래 도로명주소 중 정확한 매물을 선택하면 건축물대장·실거래 연동 코드가 자동 입력됩니다.");
        } else if (items.length === 1) {
          await applyJusoCandidate(items[0]);
          if (kakao?.found && typeof kakao.latitude === "number") return;
        }
        if (kakao?.found && typeof kakao.latitude === "number" && typeof kakao.longitude === "number") {
          setForm((f) => ({
            ...f,
            latitude: kakao.latitude,
            longitude: kakao.longitude,
            locationLabel: kakao.regionLabel || kakao.addressName,
            bjdongMeta:
              f.bjdongMeta ??
              (kakao.sigunguCd && kakao.bjdongCd && kakao.bun
                ? {
                    sigunguCd: kakao.sigunguCd,
                    bjdongCd: kakao.bjdongCd,
                    bun: kakao.bun,
                    ji: kakao.ji || "0000",
                  }
                : f.bjdongMeta),
          }));
          return;
        }
        if (items.length > 0) return;
      }

      const hit = await resolveAddressToCoords(form.address);
      if (hit) {
        setForm((f) => ({
          ...f,
          latitude: hit.latitude,
          longitude: hit.longitude,
          locationLabel: hit.locationLabel,
        }));
      } else {
        setGeoNotice("주소를 찾지 못했습니다. 서울 자치구 목록에서 직접 선택해 주세요.");
      }
    } finally {
      setGeocoding(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ ...form, title: form.title.trim(), address: form.address.trim() || "—" }, file, kind, quality);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="max-h-[94vh] w-full max-w-xl overflow-y-auto border border-ink bg-paper sm:max-h-[90vh]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink bg-paper px-4 py-3">
          <h2 className="text-sm font-bold">매물 추가</h2>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {/* 스캔 파일 */}
          <section>
            <span className="label">스캔 / 영상</span>
            <label className="flex cursor-pointer flex-col gap-1 border border-dashed border-ink/50 bg-card p-4 text-sm hover:border-accent">
              <span className="font-medium">{file ? file.name : "파일 선택 또는 폰 카메라로 촬영"}</span>
              <span className="text-xs text-mute">
                {file
                  ? `${(file.size / 1048576).toFixed(1)} MB · ${kind === "3d" ? "LiDAR / 3D 스캔 파일" : "영상 → 3D 변환"}`
                  : "iPhone 15 Pro LiDAR 스캔(.glb / .usdz / RoomPlan .json) 또는 집 내부 영상(MP4/MOV)을 지원합니다."}
              </span>
              <input
                type="file"
                accept="video/*,.glb,.usdz,.json,.splat,.spz,.sog,.ply"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {kind === "video" && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-mute">변환</span>
                {(
                  [
                    ["high", "정밀 (느림)"],
                    ["fast", "빠르게"],
                  ] as const
                ).map(([q, t]) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuality(q)}
                    className={quality === q ? "btn-solid" : "btn-line"}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 기본 정보 */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-4">
              <label className="label">이름 *</label>
              <input
                required
                className="input"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="합정역 5분 남향 투룸"
              />
            </div>
            <div className="col-span-2 sm:col-span-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="label mb-0">주소 · 위치 기준 (서울 구/동 · GPS)</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={lookupAddressCoords}
                    disabled={geocoding || !form.address.trim()}
                    className="btn-line py-0.5 text-xs disabled:opacity-50"
                    title="입력한 주소에서 위·경도 자동 조회"
                  >
                    <Search className="h-3 w-3" />
                    <span>{geocoding ? "검색 중…" : "주소 좌표 찾기"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={requestGps}
                    disabled={locating}
                    className="btn-line py-0.5 text-xs"
                  >
                    <LocateFixed className="h-3 w-3" />
                    <span>{locating ? "측정 중…" : "현재 GPS 위치"}</span>
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  className="input min-w-[200px] flex-1"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  placeholder="서울 마포구 연남동 / 강남구 역삼동 / 노원구 …"
                />
                <select
                  value=""
                  onChange={(e) => {
                    const p = SEOUL_DISTRICT_PRESETS.find((x) => x.id === e.target.value);
                    if (p) {
                      setGeoNotice(null);
                      setForm((f) => ({
                        ...f,
                        address: f.address.trim() || p.label,
                        latitude: p.lat,
                        longitude: p.lon,
                        locationLabel: p.label,
                      }));
                    }
                  }}
                  className="input w-auto text-xs"
                  aria-label="서울 자치구 빠른 선택"
                >
                  <option value="">서울 자치구 선택…</option>
                  {SEOUL_DISTRICT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {jusoCandidates.length > 0 && (
                <ul className="max-h-36 divide-y divide-line overflow-y-auto border border-ink bg-card text-xs">
                  {jusoCandidates.map((c, idx) => (
                    <li key={`${c.roadAddr}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => applyJusoCandidate(c)}
                        className="w-full px-2.5 py-1.5 text-left hover:bg-paper"
                      >
                        <div className="font-medium text-ink">
                          {c.roadAddr} {c.bdNm ? `(${c.bdNm})` : ""}
                        </div>
                        <div className="text-[11px] text-mute">{c.jibunAddr}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {typeof form.latitude === "number" && typeof form.longitude === "number" ? (
                <p className="num text-xs font-medium text-ok">
                  지정된 좌표: {form.locationLabel || "사용자 지정"} ({form.latitude.toFixed(4)}°N,{" "}
                  {form.longitude.toFixed(4)}°E)
                </p>
              ) : inferredLocation ? (
                <p className="num text-xs text-mute">
                  주소 자동 매핑: {inferredLocation.label} ({inferredLocation.lat.toFixed(3)}°N,{" "}
                  {inferredLocation.lon.toFixed(3)}°E)
                </p>
              ) : (
                <p className="text-xs text-mute">
                  미입력 시 기본 서울 기준(37.5665°N, 126.9780°E)으로 일조가 계산됩니다.
                </p>
              )}
              {geoNotice && <p className="text-xs text-warn">{geoNotice}</p>}
            </div>
            {NUMBER_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  type="number"
                  step={key === "areaPyeong" ? 0.5 : 1}
                  className="input num"
                  value={form[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                />
              </div>
            ))}
            {TEXT_FIELDS.map(({ key, label, ph }) => (
              <div key={key} className="col-span-2 sm:col-span-1">
                <label className="label">{label}</label>
                <input className="input" placeholder={ph} value={form[key]} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
            <div className="col-span-2 sm:col-span-2">
              <label className="label">향 (채광 방위 기준)</label>
              <select
                className="input"
                value={DIRECTION_OPTIONS.includes(form.direction as (typeof DIRECTION_OPTIONS)[number]) ? form.direction : ""}
                onChange={(e) => set("direction", e.target.value)}
              >
                <option value="">선택 (기본 남향)</option>
                {DIRECTION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* 체크리스트 */}
          <section>
            <span className="label">현장 체크</span>
            <ul className="divide-y divide-line border-y border-line">
              {CHECKLIST.map(({ key, label }) => (
                <li key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm">{label}</span>
                  <div className="flex gap-1">
                    {GRADES.map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => set("checklist", { ...form.checklist, [key]: g.value })}
                        className={`border px-2.5 py-1 text-xs ${
                          form.checklist[key] === g.value ? g.solid : "border-line text-mute hover:border-ink"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* 메모 */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">장점</label>
              <input className="input" value={form.pros} onChange={(e) => set("pros", e.target.value)} />
            </div>
            <div>
              <label className="label">단점</label>
              <input className="input" value={form.cons} onChange={(e) => set("cons", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">메모 (치수, 특이사항)</label>
              <textarea
                rows={2}
                className="input"
                value={form.memo}
                onChange={(e) => set("memo", e.target.value)}
                placeholder="냉장고 자리 폭 78cm"
              />
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink bg-paper px-4 py-3">
          <button type="button" onClick={onClose} className="btn-line">
            취소
          </button>
          <button type="submit" disabled={busy || !form.title.trim()} className="btn-solid">
            {busy ? "저장 중…" : file ? "저장하고 변환" : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
