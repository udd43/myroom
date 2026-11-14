"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Eye } from "lucide-react";
import { api, getApiBaseUrl } from "@/lib/api";
import RoomDetail, { RoomAnalysisSection } from "@/components/RoomDetail";
import { RoomItem } from "@/types/room";

export default function SharedRoomPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const [room, setRoom] = useState<RoomItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setLoading(true);
    setError(null);
    api
      .getSharedRoom(apiBase, token)
      .then((res) => {
        if (!cancelled) setRoom(res.room);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "공유 링크가 유효하지 않거나 만료되었습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, token]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink py-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-ink">
              {room ? room.title : "MyRoom 공유 리포트"}
            </h1>
            <span className="inline-flex items-center gap-1 border border-ink bg-card px-2 py-0.5 text-[11px] font-semibold text-ink">
              <Eye className="h-3 w-3 text-accent" /> 읽기 전용 공유 링크
            </span>
          </div>
          {room && <p className="mt-0.5 text-xs text-mute">{room.address}</p>}
        </div>

        <Link href="/" className="btn-line py-1 text-xs">
          내 MyRoom 열기
        </Link>
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-mute">공유된 3D 공간과 임장 기록을 불러오는 중…</p>
      ) : error || !room ? (
        <div className="mt-6 border border-danger/40 bg-red-50 p-6 text-center text-sm text-danger">
          {error || "공유된 매물을 찾을 수 없습니다."}
        </div>
      ) : (
        <div className="pt-5">
          <RoomDetail room={room} apiBaseUrl={apiBase} readOnly showPermalink={false} />
          <RoomAnalysisSection room={room} apiBase={apiBase} serverOnline readOnly />
        </div>
      )}
    </main>
  );
}
