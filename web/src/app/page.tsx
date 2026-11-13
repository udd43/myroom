"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useRooms } from "@/hooks/useRooms";
import RoomList from "@/components/RoomList";
import RoomDetail, { RoomAnalysisSection } from "@/components/RoomDetail";
import RoomCompareView from "@/components/RoomCompareView";
import AddRoomDialog from "@/components/AddRoomDialog";

type Tab = "list" | "compare";

export default function Page() {
  const { apiBase, online, rooms, addRoom, addPin, updateFurnitures, updateRoom, uploadScanToRoom, removeRoom } =
    useRooms();
  const [tab, setTab] = useState<Tab>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selected = rooms.find((r) => r.id === selectedId) ?? rooms[0] ?? null;
  const ready = rooms.filter((r) => r.status === "ready");

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex items-end justify-between border-b border-ink py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">MyRoom</h1>
          <p className="mt-0.5 text-xs text-mute">
            {online
              ? "서버 연결 · LiDAR RoomPlan / OpenSplat / DUSt3R 파이프라인"
              : "서버 없음 · 이 브라우저에만 저장"}
          </p>
        </div>
        <nav className="flex items-center gap-5 text-sm">
          {(["list", "compare"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border-b-2 pb-0.5 ${
                tab === t
                  ? "border-accent font-bold text-ink"
                  : "border-transparent font-medium text-mute hover:text-ink"
              }`}
            >
              {t === "list" ? "매물" : "비교"}
            </button>
          ))}
          <button onClick={() => setAdding(true)} className="btn-solid">
            <Plus className="h-3.5 w-3.5" /> 추가
          </button>
        </nav>
      </header>

      {tab === "compare" ? (
        <div className="pt-5">
          {ready.length ? (
            <RoomCompareView rooms={ready} apiBaseUrl={apiBase} />
          ) : (
            <p className="py-16 text-center text-sm text-mute">3D가 준비된 매물이 없습니다.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-6 pt-5 lg:grid-cols-[300px_1fr]">
          <aside>
            <RoomList
              rooms={rooms}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              onDelete={(id) => {
                removeRoom(id);
                if (selectedId === id) setSelectedId(null);
              }}
            />
          </aside>
          <section className="min-w-0">
            {selected ? (
              <RoomDetail
                room={selected}
                apiBaseUrl={apiBase}
                onAddPin={(p) => addPin(selected.id, p)}
                onUpdateFurnitures={(items) => updateFurnitures(selected.id, items)}
                onUpdateRoom={(patch) => updateRoom(selected.id, patch)}
                onUploadScanFile={(f) => uploadScanToRoom(selected.id, f)}
              />
            ) : (
              <p className="border border-dashed border-line p-10 text-center text-sm text-mute">
                매물을 선택하세요.
              </p>
            )}
          </section>
        </div>
      )}

      {tab === "list" && selected && (
        <RoomAnalysisSection
          room={selected}
          onUpdateRoom={(patch) => updateRoom(selected.id, patch)}
        />
      )}

      {adding && (
        <AddRoomDialog
          onClose={() => setAdding(false)}
          onSubmit={async (meta, file, kind, quality) => {
            const id = await addRoom(meta, file, kind, quality);
            setSelectedId(id);
            setTab("list");
          }}
        />
      )}
    </main>
  );
}
