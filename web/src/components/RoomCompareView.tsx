"use client";

import React, { useState } from "react";
import { Link2, Unlink2 } from "lucide-react";
import { RoomItem } from "@/types/room";
import RoomViewer from "./RoomViewer";
import type { SyncedOrbitState } from "./VolumetricRoomViewer";
import { CHECKLIST, GRADES, checklistScore } from "@/lib/checklist";
import { man, monthlyTotal, priceLine, sqm } from "@/lib/format";
import { analyzeDailySunlight, getCurrentDayOfYear, resolveRoomLocation } from "@/lib/sunlight";

interface Props {
  rooms: RoomItem[];
  apiBaseUrl: string;
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

/** 값이 더 낫은 쪽(낮을수록 좋음)에 굵게 표시 */
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
    <div className="grid grid-cols-[1fr_88px_1fr] items-center gap-2 border-b border-line py-2 text-sm">
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

  const A = rooms.find((r) => r.id === aId) ?? rooms[0];
  const B = rooms.find((r) => r.id === bId) ?? rooms[0];
  const sa = checklistScore(A.checklist);
  const sb = checklistScore(B.checklist);
  const dayOfYear = getCurrentDayOfYear();
  const locA = resolveRoomLocation(A);
  const locB = resolveRoomLocation(B);
  const sunA = analyzeDailySunlight(A, dayOfYear, true);
  const sunB = analyzeDailySunlight(B, dayOfYear, true);

  const viewer = (room: RoomItem) => (
    <div className="h-[340px] sm:h-[420px]">
      <RoomViewer
        key={room.id}
        room={room}
        apiBaseUrl={apiBaseUrl}
        compact
        syncedCamera={sync ? orbit : null}
        onCameraSyncChange={sync ? setOrbit : undefined}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Picker label="A" value={A.id} rooms={rooms} onChange={setAId} />
        <Picker label="B" value={B.id} rooms={rooms} onChange={setBId} />
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
          a={`${sunA.grade} (동지 ${sunA.winterHours.toFixed(1)}h · 춘추 ${sunA.equinoxHours.toFixed(1)}h)`}
          b={`${sunB.grade} (동지 ${sunB.winterHours.toFixed(1)}h · 춘추 ${sunB.equinoxHours.toFixed(1)}h)`}
          winner={higher(sunA.winterHours + sunA.equinoxHours, sunB.winterHours + sunB.equinoxHours)}
        />
        <Row k="체크 점수" a={sa} b={sb} winner={higher(sa, sb)} />
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
