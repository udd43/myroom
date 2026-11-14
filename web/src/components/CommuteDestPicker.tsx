"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Plus, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { resolveAddressToCoords } from "@/lib/locationClient";
import { CommuteDestination, WORKPLACE_PRESETS, useAppStore } from "@/store/useAppStore";

interface SearchCandidate {
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
}

interface Props {
  apiBase: string;
  serverOnline: boolean;
  prefix?: string;
  align?: "left" | "right";
  busy?: boolean;
  onSelectDest?: (dest: CommuteDestination) => void;
}

const CUSTOM_OPTION_VALUE = "__custom_search__";

export default function CommuteDestPicker({
  apiBase,
  serverOnline,
  prefix = "목적지: ",
  align = "right",
  busy = false,
  onSelectDest,
}: Props) {
  const commuteDest = useAppStore((s) => s.commuteDest);
  const setCommuteDest = useAppStore((s) => s.setCommuteDest);
  const customDestinations = useAppStore((s) => s.customDestinations);
  const addCustomDestination = useAppStore((s) => s.addCustomDestination);
  const removeCustomDestination = useAppStore((s) => s.removeCustomDestination);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const allKnown = [...customDestinations, ...WORKPLACE_PRESETS];
  const hasCurrent = allKnown.some((d) => d.label === commuteDest.label);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === CUSTOM_OPTION_VALUE) {
      setOpen(true);
      return;
    }
    const picked = allKnown.find((d) => d.label === val);
    if (!picked) return;
    setCommuteDest(picked);
    onSelectDest?.(picked);
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setCandidates([]);
    try {
      if (serverOnline && apiBase) {
        const res = await api.geocodeKakao(apiBase, q);
        if (res.configured && res.candidates && res.candidates.length > 0) {
          setCandidates(
            res.candidates.map((c) => ({
              label: (c.name || c.address || q).trim(),
              address: c.address && c.address !== c.name ? c.address : undefined,
              latitude: c.latitude,
              longitude: c.longitude,
            }))
          );
          return;
        }
        if (res.configured && res.found && res.latitude != null && res.longitude != null) {
          setCandidates([
            {
              label: (res.addressName || q).trim(),
              latitude: res.latitude,
              longitude: res.longitude,
            },
          ]);
          return;
        }
      }

      const fallback = await resolveAddressToCoords(q);
      if (fallback) {
        setCandidates([
          {
            label: (fallback.locationLabel || q).trim(),
            address: fallback.locationLabel !== q ? fallback.locationLabel : undefined,
            latitude: fallback.latitude,
            longitude: fallback.longitude,
          },
        ]);
      } else {
        setSearchError("일치하는 장소를 찾지 못했습니다. 역명·학교·회사명 또는 도로명 주소로 다시 검색해 보세요.");
      }
    } catch {
      const fallback = await resolveAddressToCoords(q).catch(() => null);
      if (fallback) {
        setCandidates([
          {
            label: (fallback.locationLabel || q).trim(),
            latitude: fallback.latitude,
            longitude: fallback.longitude,
          },
        ]);
      } else {
        setSearchError("목적지 검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSearching(false);
    }
  };

  const chooseCandidate = (c: SearchCandidate) => {
    const dest: CommuteDestination = {
      label: c.label,
      latitude: c.latitude,
      longitude: c.longitude,
    };
    addCustomDestination(dest);
    setOpen(false);
    setQuery("");
    setCandidates([]);
    setSearchError(null);
    onSelectDest?.(dest);
  };

  const selectSaved = (d: CommuteDestination) => {
    setCommuteDest(d);
    setOpen(false);
    onSelectDest?.(d);
  };

  return (
    <div ref={rootRef} className="relative inline-flex flex-wrap items-center gap-1.5">
      <select
        value={commuteDest.label}
        onChange={handleSelectChange}
        className="input w-auto max-w-[230px] py-1 text-xs"
        aria-label="출퇴근 기준 목적지"
        title="출퇴근 기준 목적지 선택"
      >
        {!hasCurrent && (
          <option value={commuteDest.label}>
            {prefix}
            {commuteDest.label}
          </option>
        )}
        {customDestinations.length > 0 && (
          <optgroup label="내가 추가한 목적지">
            {customDestinations.map((d) => (
              <option key={`custom-${d.label}`} value={d.label}>
                {prefix}★ {d.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="주요 권역 프리셋">
          {WORKPLACE_PRESETS.map((p) => (
            <option key={`preset-${p.label}`} value={p.label}>
              {prefix}
              {p.label}
            </option>
          ))}
        </optgroup>
        <option value={CUSTOM_OPTION_VALUE}>+ 내 직장·학교 직접 검색해서 추가…</option>
      </select>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-line py-1 text-xs"
        title="원하는 직장·학교·지하철역·주소를 검색해 목적지로 설정"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        <span>직접 검색</span>
      </button>

      {open && (
        <div
          className={`fixed inset-x-3 top-20 z-50 rounded-xl border border-ink bg-card p-3 shadow-xl sm:inset-x-auto sm:absolute sm:top-full sm:mt-1.5 sm:w-[360px] ${
            align === "right" ? "sm:right-0" : "sm:left-0"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              <span>직장 · 학교 · 원하는 목적지 검색</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-mute hover:bg-paper hover:text-ink"
              aria-label="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="예: 판교 카카오, 서울대학교, 건대입구, 테헤란로 152"
              className="input flex-1 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching || !query.trim()}
              className="btn-solid shrink-0 py-1.5 text-xs disabled:opacity-50"
            >
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              <span>검색</span>
            </button>
          </div>

          {!serverOnline && (
            <p className="mt-1.5 text-[11px] text-mute">
              서버 미연결 상태에서는 기본 지역·OSM 주소 검색으로 동작합니다.
            </p>
          )}

          {searchError && (
            <p className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
              {searchError}
            </p>
          )}

          {candidates.length > 0 && (
            <div className="mt-2.5 max-h-52 space-y-1 overflow-y-auto">
              <div className="text-[11px] font-semibold text-mute">
                검색 결과에서 목적지를 선택하세요
              </div>
              {candidates.map((c, idx) => (
                <button
                  key={`${c.label}-${c.latitude}-${idx}`}
                  type="button"
                  onClick={() => chooseCandidate(c)}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-left transition hover:border-ink hover:bg-white"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-ink">{c.label}</div>
                    {c.address && (
                      <div className="truncate text-[11px] text-mute">{c.address}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold text-accent">선택</span>
                </button>
              ))}
            </div>
          )}

          {customDestinations.length > 0 && (
            <div className="mt-3 border-t border-line pt-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-mute">
                내가 저장한 목적지
              </div>
              <div className="flex flex-wrap gap-1.5">
                {customDestinations.map((d) => {
                  const active = d.label === commuteDest.label;
                  return (
                    <div
                      key={`chip-${d.label}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-paper text-ink"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectSaved(d)}
                        className="max-w-[180px] truncate text-left"
                        title={d.label}
                      >
                        {d.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCustomDestination(d.label)}
                        className={`rounded-full p-0.5 ${
                          active ? "hover:bg-white/20" : "text-mute hover:text-red-600"
                        }`}
                        aria-label={`${d.label} 삭제`}
                        title="저장한 목적지 삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
