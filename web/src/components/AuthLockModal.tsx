"use client";

import React, { useState } from "react";
import { Lock, ShieldCheck, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose?: () => void;
  onSubmit: (password: string) => Promise<boolean | void>;
  required?: boolean;
}

export default function AuthLockModal({ open, onClose, onSubmit, required = false }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(password);
      if (res === false) {
        setError("서버 주소가 설정되어 있지 않아 인증을 진행할 수 없습니다.");
        return;
      }
      setPassword("");
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호가 올바르지 않습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-ink bg-paper p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Lock className="h-4 w-4 text-accent" />
            <span>MyRoom 서버 관리자 잠금</span>
          </div>
          {!required && onClose && (
            <button type="button" onClick={onClose} aria-label="닫기" className="text-mute hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="mb-3 text-xs leading-relaxed text-mute">
          서버에 <code className="bg-card px-1">MYROOM_ADMIN_PASSWORD</code>가 설정되어 있어 매물 조회·등록·수정을
          위해 인증이 필요합니다. 공유받은 <code className="bg-card px-1">/share/[토큰]</code> 링크는 로그인 없이
          열람할 수 있습니다.
        </p>

        <label className="label">관리자 비밀번호</label>
        <input
          type="password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호 입력"
          className="input mb-3"
        />

        {error && <p className="mb-3 border border-danger/40 bg-red-50 px-2.5 py-1.5 text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          {!required && onClose && (
            <button type="button" onClick={onClose} className="btn-line">
              오프라인 보기
            </button>
          )}
          <button type="submit" disabled={busy || !password.trim()} className="btn-solid">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{busy ? "확인 중…" : "잠금 해제"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
