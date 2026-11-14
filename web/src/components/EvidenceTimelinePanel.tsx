"use client";

import React, { useMemo, useRef, useState } from "react";
import { Camera, Clock, Mic, Plus, Printer, Trash2, Volume2 } from "lucide-react";
import { api, resolveMediaUrl } from "@/lib/api";
import { RoomItem, TimelineEvent, TimelineStage } from "@/types/room";
import { measureAmbientNoiseDb } from "./ViewerOverlays";

interface Props {
  room: RoomItem;
  apiBase: string;
  serverOnline: boolean;
  readOnly?: boolean;
  onAddTimelineEvent?: (event: Omit<TimelineEvent, "id">) => Promise<void> | void;
  onDeleteTimelineEvent?: (eventId: string) => Promise<void> | void;
}

const STAGE_META: Record<TimelineStage, { label: string; badge: string }> = {
  viewing: { label: "임장 체크", badge: "bg-slate-600 text-white" },
  contract: { label: "계약 체결", badge: "bg-amber-700 text-white" },
  move_in: { label: "입주 직후(기준)", badge: "bg-ok text-white" },
  living: { label: "거주 중 수리·하자", badge: "bg-accent text-white" },
  move_out: { label: "퇴실 원상복구", badge: "bg-danger text-white" },
};

function mapPinStageToTimeline(stage?: string): TimelineStage {
  if (stage === "move_in") return "move_in";
  if (stage === "move_out") return "move_out";
  if (stage === "defect") return "living";
  return "viewing";
}

interface UnifiedEntry {
  key: string;
  source: "event" | "pin";
  rawId: string;
  stage: TimelineStage;
  title: string;
  note?: string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "audio";
  noiseDb?: number;
  createdAt: string;
}

export default function EvidenceTimelinePanel({
  room,
  apiBase,
  serverOnline,
  readOnly = false,
  onAddTimelineEvent,
  onDeleteTimelineEvent,
}: Props) {
  const [stageFilter, setStageFilter] = useState<TimelineStage | "all">("all");
  const [showForm, setShowForm] = useState(false);

  const [stage, setStage] = useState<TimelineStage>("move_in");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio" | undefined>();
  const [noiseDb, setNoiseDb] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo<UnifiedEntry[]>(() => {
    const out: UnifiedEntry[] = [];
    for (const ev of room.timeline || []) {
      out.push({
        key: `ev-${ev.id}`,
        source: "event",
        rawId: ev.id,
        stage: ev.stage,
        title: ev.title,
        note: ev.note,
        mediaUrl: resolveMediaUrl(apiBase, ev.mediaUrl),
        mediaType: ev.mediaType,
        noiseDb: ev.noiseDb,
        createdAt: ev.createdAt,
      });
    }
    for (const p of room.pins || []) {
      if (!p.mediaUrl && typeof p.noiseDb !== "number" && p.stage !== "move_in" && p.stage !== "move_out") {
        continue;
      }
      out.push({
        key: `pin-${p.id}`,
        source: "pin",
        rawId: p.id,
        stage: mapPinStageToTimeline(p.stage),
        title: `[3D 핀] ${p.label}`,
        note: p.note,
        mediaUrl: resolveMediaUrl(apiBase, p.mediaUrl),
        mediaType: p.mediaType,
        noiseDb: p.noiseDb,
        createdAt: p.createdAt || room.createdAt,
      });
    }
    return out
      .filter((e) => stageFilter === "all" || e.stage === stageFilter)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [room.timeline, room.pins, room.createdAt, apiBase, stageFilter]);

  const moveInCount = useMemo(
    () => (room.timeline || []).filter((e) => e.stage === "move_in").length +
      (room.pins || []).filter((p) => p.stage === "move_in").length,
    [room.timeline, room.pins]
  );
  const moveOutCount = useMemo(
    () => (room.timeline || []).filter((e) => e.stage === "move_out").length +
      (room.pins || []).filter((p) => p.stage === "move_out").length,
    [room.timeline, room.pins]
  );

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setErrMsg(null);
    try {
      if (serverOnline && apiBase) {
        const uploaded = await api.uploadMedia(apiBase, room.id, f);
        setMediaUrl(uploaded.url);
        setMediaType(uploaded.mediaType);
      } else {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((res, rej) => {
          reader.onload = () => res(String(reader.result || ""));
          reader.onerror = () => rej(new Error("파일 읽기 실패"));
          reader.readAsDataURL(f);
        });
        setMediaUrl(dataUrl);
        setMediaType(f.type.startsWith("video/") ? "video" : "image");
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "첨부 업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleNoise = async () => {
    setMeasuring(true);
    setErrMsg(null);
    try {
      const db = await measureAmbientNoiseDb();
      setNoiseDb(db);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "마이크 권한이 필요합니다.");
    } finally {
      setMeasuring(false);
    }
  };

  const submitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddTimelineEvent || !title.trim()) return;
    setBusy(true);
    try {
      await onAddTimelineEvent({
        stage,
        title: title.trim(),
        note: note.trim() || undefined,
        mediaUrl: mediaUrl || undefined,
        mediaType,
        noiseDb: noiseDb ?? undefined,
        createdAt: new Date().toISOString(),
      });
      setTitle("");
      setNote("");
      setMediaUrl(null);
      setMediaType(undefined);
      setNoiseDb(null);
      setShowForm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div>
          <span className="label mb-0">입주 직후 vs 퇴실 전 원상복구 증거 타임라인</span>
          <p className="num text-[11px] text-mute">
            입주 기준 증거 {moveInCount}건 · 퇴실/현장 확인 {moveOutCount}건 · 전체 기록 {entries.length}건
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-line py-1 text-xs"
            title="입주·퇴실 비교 원상복구 증빙 인쇄 또는 PDF 저장"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>증거 리포트 인쇄/PDF</span>
          </button>
          {!readOnly && onAddTimelineEvent && (
            <button type="button" onClick={() => setShowForm((v) => !v)} className="btn-solid py-1 text-xs">
              <Plus className="h-3.5 w-3.5" />
              <span>증거 기록 추가</span>
            </button>
          )}
        </div>
      </div>

      {/* 단계 필터 */}
      <div className="flex flex-wrap gap-1.5 text-xs print:hidden">
        {(["all", "viewing", "contract", "move_in", "living", "move_out"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStageFilter(k)}
            className={`border px-2.5 py-0.5 ${
              stageFilter === k ? "border-ink bg-ink text-paper font-semibold" : "border-line bg-paper text-mute hover:border-ink"
            }`}
          >
            {k === "all" ? "전체" : STAGE_META[k].label}
          </button>
        ))}
      </div>

      {/* 추가 폼 */}
      {!readOnly && showForm && (
        <form onSubmit={submitEvent} className="space-y-2 border border-ink bg-paper p-3 text-xs">
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={stage} onChange={(e) => setStage(e.target.value as TimelineStage)} className="input py-1 text-xs">
              {(Object.keys(STAGE_META) as TimelineStage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE_META[s].label}
                </option>
              ))}
            </select>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 입주 당일 거실 벽지/장판 상태 촬영"
              className="input py-1 text-xs sm:col-span-2"
            />
          </div>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="특이사항(스크래치 위치, 임대인 확인 문자 요약, 수압/결로 측정 결과 등)"
            className="input text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-line py-1 text-xs">
              <Camera className="h-3.5 w-3.5" />
              <span>{mediaUrl ? "사진·영상 첨부됨" : "사진·짧은 영상 첨부"}</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleFile} className="hidden" />
            <button type="button" onClick={handleNoise} disabled={measuring} className="btn-line py-1 text-xs">
              <Mic className="h-3.5 w-3.5" />
              <span>{measuring ? "소음 측정 중…" : noiseDb !== null ? `${noiseDb} dB 측정됨` : "실측 소음(dB) 추가"}</span>
            </button>
            <button type="submit" disabled={busy || !title.trim()} className="btn-solid ml-auto py-1 text-xs">
              타임라인 저장
            </button>
          </div>
          {errMsg && <p className="text-danger">{errMsg}</p>}
        </form>
      )}

      {/* 타임라인 목록 */}
      {entries.length === 0 ? (
        <p className="border border-dashed border-line bg-paper p-4 text-xs text-mute">
          아직 타임라인 증거가 없습니다. 3D 뷰어에서 사진/영상/소음 핀을 꽂거나{" "}
          <strong>증거 기록 추가</strong>를 눌러 입주 당일 상태를 남겨두면 2년 뒤 퇴실 분쟁 시 바로 비교할 수
          있습니다.
        </p>
      ) : (
        <ol className="space-y-2 border-l-2 border-ink/25 pl-3">
          {entries.map((entry) => (
            <li key={entry.key} className="border border-line bg-paper p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 text-[11px] font-bold ${STAGE_META[entry.stage].badge}`}>
                    {STAGE_META[entry.stage].label}
                  </span>
                  <strong className="text-sm text-ink">{entry.title}</strong>
                  {typeof entry.noiseDb === "number" && (
                    <span className="num flex items-center gap-1 border border-amber-700/30 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-900">
                      <Volume2 className="h-3 w-3" /> {entry.noiseDb.toFixed(1)} dB
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-mute">
                  <span className="num flex items-center gap-1 text-[11px]">
                    <Clock className="h-3 w-3" />
                    {entry.createdAt.slice(0, 10)}
                  </span>
                  {!readOnly && entry.source === "event" && onDeleteTimelineEvent && (
                    <button
                      type="button"
                      onClick={() => onDeleteTimelineEvent(entry.rawId)}
                      className="text-mute hover:text-danger print:hidden"
                      title="기록 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {entry.note && <p className="mt-1.5 text-ink/90">{entry.note}</p>}
              {entry.mediaUrl && (
                <div className="mt-2 max-w-xs overflow-hidden border border-line bg-card">
                  {entry.mediaType === "video" ? (
                    <video src={entry.mediaUrl} controls playsInline className="max-h-44 w-full object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.mediaUrl} alt={entry.title} className="max-h-44 w-full object-cover" />
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

