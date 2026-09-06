'use client';

import { useState, useCallback, useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import {
  clearChatLocalCacheOnLogout,
} from '@/app/lib/hooks/useChatLocalCachePersistence';
import { resetChatSessionState } from '@/app/lib/chat/resetChatSessionState';
import { useCurrentUserId } from '@/app/lib/hooks/useCurrentUserId';
import { useUIStore } from '@/app/store/useUIStore';

type LogoutModalProps = {
  variant?: "card" | "list";
};

export function LogoutModal({ variant = "card" }: LogoutModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const setUserAuthRole = useUIStore((state) => state.setUserAuthRole);
  const currentUserId = useCurrentUserId();

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  const handleLogout = useCallback(() => {
    startTransition(async () => {
      clearChatLocalCacheOnLogout(currentUserId);
      resetChatSessionState();
      setUserAuthRole('GUEST');
      setIsOpen(false);
      await logout();
    });
  }, [currentUserId, setUserAuthRole]);

  return (
    <>
      {/* Trigger row */}
      <button
        type="button"
        onClick={openModal}
        className={
          variant === "list"
            ? "w-full flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 text-left hover:bg-bg-hover/40 transition-colors min-h-11"
            : "w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-elevated hover:bg-bg-hover transition-colors active:scale-[0.99] min-h-11 text-left"
        }
        aria-haspopup="dialog"
      >
        <div className="flex items-center gap-3">
          {variant === "card" && (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" strokeWidth="1.5" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          )}
          <span
            className={
              variant === "list"
                ? "font-sans text-[13px] font-semibold text-warning"
                : "font-sans text-[14px] font-medium text-warning"
            }
          >
            登出
          </span>
        </div>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#50453b" strokeWidth="1.5" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Confirmation modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.65)] backdrop-blur-sm"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-white/[0.08] bg-bg-elevated p-5 shadow-[0_16px_48px_rgba(0,0,0,0.70)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10">
                <LogOut className="h-5 w-5 text-brand" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2
                  id="logout-modal-title"
                  className="font-sans text-[15px] font-bold text-text-primary"
                >
                  確認登出
                </h2>
                <p className="mt-1 font-sans text-[13px] leading-snug text-text-secondary">
                  您確定要結束目前的會話並登出嗎？
                </p>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={closeModal}
                disabled={isPending}
                className="h-10 flex-1 rounded-lg border border-white/[0.1] font-sans text-[13px] font-medium text-text-secondary transition-colors hover:bg-white/[0.04] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isPending}
                className="h-10 flex-1 rounded-lg bg-brand font-sans text-[13px] font-semibold text-[#17130f] transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {isPending ? '登出中…' : '確認登出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
