"use client";

import React, { useState } from "react";
import Link from "next/link";
import { CloudUpload, Lock, LogOut, Plus, ShieldCheck } from "lucide-react";
import { useRooms } from "@/hooks/useRooms";
import RoomList from "@/components/RoomList";
import RoomDetail, { RoomAnalysisSection } from "@/components/RoomDetail";
import RoomCompareView from "@/components/RoomCompareView";
import AddRoomDialog from "@/components/AddRoomDialog";
import AuthLockModal from "@/components/AuthLockModal";

type Tab = "list" | "compare";

export default function Page() {
  const {
    apiBase,
    serverOnline,
    authStatus,
    isLocked,
    rooms,
    localUnsyncedCount,
    syncLocalToServer,
    login,
    logout,
    addRoom,
    addPin,
    updateFurnitures,
    updateRoom,
    addTimelineEvent,
    deleteTimelineEvent,
    uploadScanToRoom,
    createShareLink,
    revokeShareLink,
    removeRoom,
  } = useRooms();

  const [tab, setTab] = useState<Tab>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const selected = rooms.find((r) => r.id === selectedId) ?? rooms[0] ?? null;
  const ready = rooms.filter((r) => r.status === "ready");

  const handleSyncLocal = async () => {
    setSyncBusy(true);
    setSyncNotice(null);
    try {
      const count = await syncLocalToServer();
      setSyncNotice(`브라우저 저장 매물 ${count}건을 서버(SQLite)에 안전하게 동기화했습니다.`);
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : "동기화에 실패했습니다.");
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-ink">MyRoom</h1>
            {serverOnline && authStatus.authEnabled && (
              isLocked ? (
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(true)}
                  className="inline-flex items-center gap-1 border border-danger bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-danger"
                >
                  <Lock className="h-3 w-3" /> 잠금 해제 필요
                </button>
              ) : (
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1 border border-ok/40 bg-card px-2 py-0.5 text-[11px] font-semibold text-ok hover:border-ink"
                  title="클릭 시 관리자 세션 잠금"
                >
                  <ShieldCheck className="h-3 w-3" /> 인증됨 <LogOut className="h-2.5 w-2.5 opacity-60" />
                </button>
              )
            )}
          </div>
          <p className="mt-0.5 text-xs text-mute">
            {serverOnline
              ? "서버 연결 · SQLite WAL + Spark 3DGS / USDZ / 공공데이터·실거래·일조 파이프라인"
              : "서버 없음 · 이 브라우저에만 저장"}
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-4 text-sm">
          {localUnsyncedCount > 0 && serverOnline && !isLocked && (
            <button
              type="button"
              onClick={handleSyncLocal}
              disabled={syncBusy}
              className="btn-line border-accent text-accent hover:bg-accent hover:text-white"
            >
              <CloudUpload className="h-3.5 w-3.5" />
              <span>{syncBusy ? "업로드 중…" : `브라우저 매물 ${localUnsyncedCount}건 서버로 올리기`}</span>
            </button>
          )}
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
          <Link href="/compare" className="hidden text-xs text-mute hover:text-ink sm:inline">
            전체 비교 페이지 ↗
          </Link>
          <button onClick={() => setAdding(true)} className="btn-solid">
            <Plus className="h-3.5 w-3.5" /> 추가
          </button>
        </nav>
      </header>

      {isLocked && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-danger bg-red-50 px-4 py-2.5 text-xs text-red-900">
          <span>
            <strong>서버가 비밀번호로 보호되어 있습니다.</strong> 현재는 브라우저 로컬 캐시만 표시됩니다.
          </span>
          <button type="button" onClick={() => setAuthModalOpen(true)} className="btn-solid py-1 text-xs">
            <Lock className="h-3.5 w-3.5" /> 비밀번호 입력
          </button>
        </div>
      )}

      {syncNotice && (
        <div className="mt-3 border border-ok/40 bg-card px-4 py-2 text-xs text-ok">{syncNotice}</div>
      )}

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
                onCreateShareLink={(regen) => createShareLink(selected.id, regen)}
                onRevokeShareLink={() => revokeShareLink(selected.id)}
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
          apiBase={apiBase}
          serverOnline={serverOnline}
          onUpdateRoom={(patch) => updateRoom(selected.id, patch)}
          onAddTimelineEvent={(ev) => addTimelineEvent(selected.id, ev)}
          onDeleteTimelineEvent={(eid) => deleteTimelineEvent(selected.id, eid)}
        />
      )}

      {adding && (
        <AddRoomDialog
          apiBase={apiBase}
          serverOnline={serverOnline}
          onClose={() => setAdding(false)}
          onSubmit={async (meta, file, kind, quality) => {
            const id = await addRoom(meta, file, kind, quality);
            setSelectedId(id);
            setTab("list");
          }}
        />
      )}

      <AuthLockModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onSubmit={login} />
    </main>
  );
}
