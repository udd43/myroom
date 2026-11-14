"use client";

import React, { useRef, useState } from "react";
import { Camera, Mic, MicOff, Volume2 } from "lucide-react";
import { api, resolveMediaUrl } from "@/lib/api";
import { PinStage, RoomPin } from "@/types/room";

/** 뷰어 위 안내 배너 (상단 중앙) */
export function Banner({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "accent" }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-3 right-3 top-14 z-20 w-fit max-w-[calc(100%-1.5rem)] px-3 py-2 text-xs shadow-lg ${
        tone === "accent" ? "bg-accent text-white" : "border border-white/15 bg-stage/95 text-paper"
      }`}
    >
      {children}
    </div>
  );
}

export function MeasureBanner({ distance, hasStart }: { distance: number | null; hasStart: boolean }) {
  return (
    <Banner tone="accent">
      {distance !== null ? (
        <>
          <span className="num font-bold">{distance.toFixed(2)} m</span>
          <span className="num ml-2 opacity-80">{Math.round(distance * 100)} cm</span>
        </>
      ) : hasStart ? (
        "끝 지점을 탭하세요"
      ) : (
        "시작 지점을 탭하세요"
      )}
    </Banner>
  );
}

const PIN_CATEGORIES: Array<{ value: RoomPin["category"]; label: string }> = [
  { value: "check", label: "체크" },
  { value: "size", label: "치수" },
  { value: "issue", label: "하자" },
  { value: "info", label: "메모" },
];

const PIN_STAGES: Array<{ value: PinStage; label: string }> = [
  { value: "viewing", label: "임장 체크" },
  { value: "move_in", label: "입주 직후(증거)" },
  { value: "defect", label: "하자/수리" },
  { value: "move_out", label: "퇴실 확인" },
];

/** Web Audio API 기반 1.2초 실측 소음(dB) 측정 유틸 */
export async function measureAmbientNoiseDb(): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("이 브라우저 환경에서는 마이크 측정이 지원되지 않습니다.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const samples: number[] = [];

    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 140));
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
      const rms = Math.sqrt(sum / buf.length);
      if (rms > 1e-6) {
        const dbApprox = 20 * Math.log10(rms) + 96;
        samples.push(Math.max(24, Math.min(102, dbApprox)));
      }
    }
    if (samples.length === 0) return 34.0;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return Math.round(avg * 10) / 10;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => undefined);
  }
}

/** 위치를 찍은 뒤 라벨·사진/영상·소음(dB)을 입력받는 핀 입력창 */
export function PinPrompt({
  position,
  roomId,
  apiBaseUrl,
  onSave,
}: {
  position: [number, number, number] | null;
  roomId?: string;
  apiBaseUrl?: string;
  onSave: (pin: Omit<RoomPin, "id">) => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<RoomPin["category"]>("check");
  const [stage, setStage] = useState<PinStage>("viewing");
  const [noiseDb, setNoiseDb] = useState<number | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio" | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!position) return <Banner>메모·사진·소음 핀을 남길 3D 위치를 탭하세요</Banner>;

  const handleMeasureNoise = async () => {
    setMeasuring(true);
    setErrMsg(null);
    try {
      const db = await measureAmbientNoiseDb();
      setNoiseDb(db);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "마이크 접근이 필요합니다.");
    } finally {
      setMeasuring(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErrMsg(null);
    try {
      if (apiBaseUrl && roomId) {
        const uploaded = await api.uploadMedia(apiBaseUrl, roomId, file);
        setMediaUrl(uploaded.url);
        setMediaType(uploaded.mediaType);
      } else {
        if (file.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("파일 읽기 실패"));
            reader.readAsDataURL(file);
          });
          setMediaUrl(dataUrl);
          setMediaType("image");
        } else {
          setErrMsg("동영상/음성 파일 첨부는 서버 연결 시 업로드됩니다.");
        }
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "미디어 업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Banner>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RoomPin["category"])}
            className="border border-white/20 bg-transparent px-1.5 py-1"
          >
            {PIN_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} className="text-ink">
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PinStage)}
            className="border border-white/20 bg-transparent px-1.5 py-1"
          >
            {PIN_STAGES.map((s) => (
              <option key={s.value} value={s.value} className="text-ink">
                {s.label}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="싱크대 수압·창틀 결로·소음 등"
            className="min-w-[160px] flex-1 border border-white/20 bg-transparent px-2 py-1 outline-none placeholder:text-paper/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleMeasureNoise}
            disabled={measuring}
            className="flex items-center gap-1 border border-white/25 bg-white/10 px-2 py-1 hover:bg-white/20"
          >
            {measuring ? <MicOff className="h-3 w-3 animate-pulse text-amber-300" /> : <Mic className="h-3 w-3" />}
            <span>{measuring ? "측정 중…" : noiseDb !== null ? `${noiseDb} dB` : "소음(dB) 측정"}</span>
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 border border-white/25 bg-white/10 px-2 py-1 hover:bg-white/20"
          >
            <Camera className="h-3 w-3" />
            <span>{uploading ? "업로드…" : mediaUrl ? "사진/영상 첨부됨" : "사진·영상 첨부"}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFile}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => {
              const text = label.trim() || (noiseDb !== null ? `주변 소음 ${noiseDb} dB` : "현장 메모");
              onSave({
                label: text,
                category,
                stage,
                position,
                ...(noiseDb !== null ? { noiseDb } : {}),
                ...(mediaUrl ? { mediaUrl, mediaType } : {}),
              });
              setLabel("");
              setNoiseDb(null);
              setMediaUrl(null);
              setMediaType(undefined);
            }}
            className="ml-auto bg-accent px-3 py-1 font-semibold text-white"
          >
            핀 저장
          </button>
        </div>
        {errMsg && <p className="text-[11px] text-amber-300">{errMsg}</p>}
      </div>
    </Banner>
  );
}

/** 3D 좌표를 화면에 투영한 핀 라벨들 (소음 dB·미디어 배지 포함) */
export function PinLabels({
  pins,
  apiBaseUrl = "",
  onFocus,
}: {
  pins: Array<{ pin: RoomPin; x: number; y: number; visible: boolean }>;
  apiBaseUrl?: string;
  onFocus?: (pin: RoomPin) => void;
}) {
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const activeEntry = pins.find((p) => p.pin.id === activePinId)?.pin ?? null;
  const resolvedMedia = activeEntry ? resolveMediaUrl(apiBaseUrl, activeEntry.mediaUrl) : null;

  return (
    <>
      {pins.map(({ pin, x, y, visible }) =>
        visible ? (
          <button
            key={pin.id}
            onClick={(e) => {
              e.stopPropagation();
              setActivePinId((cur) => (cur === pin.id ? null : pin.id));
              onFocus?.(pin);
            }}
            style={{ left: x, top: y }}
            className={`absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap border px-2 py-1 text-xs font-medium text-white transition-colors ${
              pin.category === "issue" || pin.stage === "defect"
                ? "border-red-400/70 bg-red-950/90"
                : "border-white/25 bg-stage/95"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 ${
                pin.category === "issue" ? "bg-red-400" : "bg-accent"
              }`}
            />
            <span>{pin.label}</span>
            {typeof pin.noiseDb === "number" && (
              <span className="num flex items-center gap-0.5 bg-white/15 px-1 text-[10px] text-amber-200">
                <Volume2 className="h-2.5 w-2.5" />
                {pin.noiseDb}dB
              </span>
            )}
            {pin.mediaUrl && (
              <span className="bg-sky-500/30 px-1 text-[10px] text-sky-200">
                {pin.mediaType === "video" ? "영상" : "사진"}
              </span>
            )}
          </button>
        ) : null
      )}

      {activeEntry && (resolvedMedia || typeof activeEntry.noiseDb === "number") && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 top-14 z-30 w-56 border border-white/25 bg-stage/95 p-2 text-xs text-white shadow-xl"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{activeEntry.label}</span>
            <button onClick={() => setActivePinId(null)} className="text-white/60 hover:text-white">
              닫기
            </button>
          </div>
          {typeof activeEntry.noiseDb === "number" && (
            <p className="num mb-1.5 text-[11px] text-amber-300">
              실측 소음: {activeEntry.noiseDb} dB ({activeEntry.noiseDb < 40 ? "조용함" : activeEntry.noiseDb < 55 ? "보통" : "소음 주의"})
            </p>
          )}
          {resolvedMedia && activeEntry.mediaType === "video" && (
            <video src={resolvedMedia} controls playsInline className="max-h-36 w-full bg-black" />
          )}
          {resolvedMedia && activeEntry.mediaType !== "video" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolvedMedia} alt={activeEntry.label} className="max-h-36 w-full object-cover" />
          )}
        </div>
      )}
    </>
  );
}

export function ViewerLoading({ text = "불러오는 중…" }: { text?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-stage/90 text-sm text-paper/80">
      {text}
    </div>
  );
}
