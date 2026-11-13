"use client";

import React, { useState } from "react";
import { RoomPin } from "@/types/room";

/** 뷰어 위 안내 배너 (상단 중앙) */
export function Banner({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "accent" }) {
  return (
    <div
      className={`absolute left-3 right-3 top-14 z-20 w-fit max-w-[calc(100%-1.5rem)] px-3 py-1.5 text-xs ${
        tone === "accent" ? "bg-accent text-white" : "bg-stage/90 text-paper border border-white/15"
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

/** 위치를 찍은 뒤 라벨을 입력받는 핀 입력창 */
export function PinPrompt({
  position,
  onSave,
}: {
  position: [number, number, number] | null;
  onSave: (pin: Omit<RoomPin, "id">) => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<RoomPin["category"]>("check");

  if (!position) return <Banner>메모를 남길 위치를 탭하세요</Banner>;

  return (
    <Banner>
      <div className="flex flex-wrap items-center gap-2">
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
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="냉장고 자리 폭 78cm"
          className="min-w-[150px] flex-1 border border-white/20 bg-transparent px-2 py-1 outline-none placeholder:text-paper/40"
        />
        <button
          onClick={() => {
            if (!label.trim()) return;
            onSave({ label: label.trim(), category, position });
            setLabel("");
          }}
          className="bg-accent px-3 py-1 font-medium text-white"
        >
          저장
        </button>
      </div>
    </Banner>
  );
}

/** 3D 좌표를 화면에 투영한 핀 라벨들 */
export function PinLabels({
  pins,
  onFocus,
}: {
  pins: Array<{ pin: RoomPin; x: number; y: number; visible: boolean }>;
  onFocus?: (pin: RoomPin) => void;
}) {
  return (
    <>
      {pins.map(({ pin, x, y, visible }) =>
        visible ? (
          <button
            key={pin.id}
            onClick={(e) => {
              e.stopPropagation();
              onFocus?.(pin);
            }}
            style={{ left: x, top: y }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1.5 whitespace-nowrap border border-white/25 bg-stage/95 px-2.5 py-1 text-xs font-medium text-white"
          >
            <span className="h-1.5 w-1.5 bg-accent" />
            {pin.label}
          </button>
        ) : null
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

