"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, GitCompare, Lock } from "lucide-react";
import { useRooms } from "@/hooks/useRooms";
import { api } from "@/lib/api";
import RoomDetail, { RoomAnalysisSection } from "@/components/RoomDetail";
import AuthLockModal from "@/components/AuthLockModal";
import { RoomItem } from "@/types/room";

export default function RoomPermalinkPage() {
  const params = useParams<{ id: string }>();
  const roomId = params?.id;
  const {
    apiBase,
    serverOnline,
    isLocked,
    login,
    rooms,
    addPin,
    updateFurnitures,
    updateRoom,
    addTimelineEvent,
    deleteTimelineEvent,
    uploadScanToRoom,
    createShareLink,
    revokeShareLink,
  } = useRooms();

  const fromList = rooms.find((r) => r.id === roomId) ?? null;
  const [fetchedRoom, setFetchedRoom] = useState<RoomItem | null>(null);
  const [loadingDirect, setLoadingDirect] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (fromList || !roomId || !apiBase || !serverOnline || isLocked) return;
    setLoadingDirect(true);
    api
      .get(apiBase, roomId)
      .then((r) => {
        if (!cancelled) setFetchedRoom(r);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingDirect(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromList, roomId, apiBase, serverOnline, isLocked]);

  const room = fromList ?? fetchedRoom;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-line py-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> 목록으로
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink">{room ? room.title : "매물 상세"}</h1>
            {room && <p className="text-xs text-mute">{room.address}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLocked && (
            <button type="button" onClick={() => setAuthModalOpen(true)} className="btn-solid py-1 text-xs">
              <Lock className="h-3.5 w-3.5" /> 잠금 해제
            </button>
          )}
          <Link href="/compare" className="btn-line py-1 text-xs">
            <GitCompare className="h-3.5 w-3.5" /> 매물 비교하기
          </Link>
        </div>
      </header>

      {!room ? (
        <div className="py-16 text-center text-sm text-mute">
          {loadingDirect
            ? "매물 정보를 불러오는 중…"
            : "해당 매물을 찾을 수 없거나 접근 권한이 없습니다."}
        </div>
      ) : (
        <div className="pt-5">
          <RoomDetail
            room={room}
            apiBaseUrl={apiBase}
            showPermalink={false}
            onAddPin={(p) => addPin(room.id, p)}
            onUpdateFurnitures={(items) => updateFurnitures(room.id, items)}
            onUpdateRoom={(patch) => updateRoom(room.id, patch)}
            onUploadScanFile={(f) => uploadScanToRoom(room.id, f)}
            onCreateShareLink={(regen) => createShareLink(room.id, regen)}
            onRevokeShareLink={() => revokeShareLink(room.id)}
          />
          <RoomAnalysisSection
            room={room}
            apiBase={apiBase}
            serverOnline={serverOnline}
            onUpdateRoom={(patch) => updateRoom(room.id, patch)}
            onAddTimelineEvent={(ev) => addTimelineEvent(room.id, ev)}
            onDeleteTimelineEvent={(eid) => deleteTimelineEvent(room.id, eid)}
          />
        </div>
      )}

      <AuthLockModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onSubmit={login} />
    </main>
  );
}
