"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRooms } from "@/hooks/useRooms";
import RoomCompareView from "@/components/RoomCompareView";

export default function ComparePage() {
  const { apiBase, rooms } = useRooms();
  const ready = rooms.filter((r) => r.status === "ready");

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-line py-1 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> 매물 목록
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-ink">매물 종합 비교 · 추천 랭킹</h1>
            <p className="text-xs text-mute">
              실질 월 주거비 · 출퇴근 소요시간 · 동지/건물그림자 일조 · 3D 시점 동기화
            </p>
          </div>
        </div>
      </header>

      <div className="pt-5">
        {ready.length > 0 ? (
          <RoomCompareView rooms={ready} apiBaseUrl={apiBase} />
        ) : (
          <p className="border border-dashed border-line py-16 text-center text-sm text-mute">
            3D가 준비된 비교 가능 매물이 아직 없습니다.
          </p>
        )}
      </div>
    </main>
  );
}
