"use client";

import React, { useState } from "react";
import { LocateFixed, X } from "lucide-react";
import { NewRoomMeta, Quality, UploadKind } from "@/types/room";
import { CHECKLIST, DEFAULT_CHECKLIST, GRADES } from "@/lib/checklist";
import { DIRECTION_OPTIONS } from "@/lib/sunlight";

interface Props {
  onClose: () => void;
  onSubmit: (meta: NewRoomMeta, file: File | null, kind: UploadKind, quality: Quality) => Promise<void>;
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

const SCAN_EXT = [".glb", ".usdz", ".json", ".splat", ".ply"];

function kindOf(file: File | null): UploadKind {
  if (!file) return "none";
  return SCAN_EXT.some((e) => file.name.toLowerCase().endsWith(e)) ? "3d" : "video";
}

export default function AddRoomDialog({ onClose, onSubmit }: Props) {
  const [form, setForm] = useState<NewRoomMeta>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState<Quality>("high");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const set = <K extends keyof NewRoomMeta>(k: K, v: NewRoomMeta[K]) => setForm((f) => ({ ...f, [k]: v }));
  const kind = kindOf(file);

  const requestGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(4);
        const lon = +pos.coords.longitude.toFixed(4);
        setForm((f) => ({
          ...f,
          latitude: lat,
          longitude: lon,
          locationLabel: f.address.trim() || `현재 GPS (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E)`,
        }));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 6000 }
    );
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
                accept="video/*,.glb,.usdz,.json,.splat,.ply"
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
            <div className="col-span-2 sm:col-span-4">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <label className="label mb-0">주소 (채광 위·경도 기준)</label>
                <div className="flex items-center gap-2">
                  {typeof form.latitude === "number" && typeof form.longitude === "number" && (
                    <span className="num text-[11px] font-medium text-ok">
                      GPS {form.latitude.toFixed(3)}°N, {form.longitude.toFixed(3)}°E
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={requestGps}
                    disabled={locating}
                    className="btn-line py-0.5 text-xs"
                  >
                    <LocateFixed className="h-3 w-3" />
                    <span>{locating ? "측정 중…" : "현재 GPS 위치 자동 입력"}</span>
                  </button>
                </div>
              </div>
              <input
                className="input"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="서울 강남구 역삼동 …"
              />
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
