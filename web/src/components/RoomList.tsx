"use client";

import { Loader2, Trash2 } from "lucide-react";
import { RoomItem } from "@/types/room";
import { priceLine, sqm } from "@/lib/format";

interface Props {
  rooms: RoomItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function Status({ r }: { r: RoomItem }) {
  if (r.status === "processing")
    return (
      <span className="flex items-center gap-1 font-semibold text-accent">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="num">{r.progress}%</span>
      </span>
    );
  if (r.status === "ready") return <span className="font-semibold text-ok">3D 있음</span>;
  if (r.status === "error") return <span className="font-semibold text-bad">실패</span>;
  return <span className="text-mute">3D 없음</span>;
}

export default function RoomList({ rooms, selectedId, onSelect, onDelete }: Props) {
  if (!rooms.length)
    return <p className="border border-dashed border-line p-5 text-sm text-mute">아직 매물이 없습니다.</p>;

  return (
    <div>
      <h2 className="sr-only">등록된 매물 목록</h2>
      <ol className="border-t border-ink">
        {rooms.map((r, i) => {
          const on = r.id === selectedId;
          return (
            <li
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`group relative cursor-pointer border-b border-line px-3 py-3 ${
                on ? "bg-card" : "hover:bg-card/70"
              }`}
            >
              {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
              <div className="flex items-baseline gap-3">
                <span className="num w-5 shrink-0 text-xs font-semibold text-mute">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-ink">{r.title}</h3>
                  <p className="num mt-0.5 text-xs text-mute">
                    {priceLine(r)} · {r.areaPyeong}평 ({sqm(r.areaPyeong)}㎡)
                  </p>
                  {r.status === "processing" && <p className="mt-1 text-xs text-mute">{r.stageText}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
                  <Status r={r} />
                  <button
                    aria-label="삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("이 매물을 삭제할까요?")) onDelete(r.id);
                    }}
                    className="text-mute opacity-0 transition hover:text-bad group-hover:opacity-100 max-sm:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
