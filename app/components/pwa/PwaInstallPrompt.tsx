"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePwaInstall } from "@/app/lib/hooks/usePwaInstall";
import { useUIStore } from "@/app/store/useUIStore";
import { isAppleSafariInstallContext } from "@/lib/pwa/detect-apple-safari";
import {
  getIsPwaSnoozed,
  snoozePwaPrompt,
  subscribePwaSnooze,
} from "@/lib/pwa/snooze";

const IOS_AUTO_PROMPT_DELAY_MS = 2_000;

export function PwaInstallPrompt() {
  const { promptState, onInstall } = usePwaInstall();
  const openIosPwaModal = useUIStore((state) => state.openIosPwaModal);
  const closeIosPwaModal = useUIStore((state) => state.closeIosPwaModal);
  const isSnoozed = useSyncExternalStore(
    subscribePwaSnooze,
    getIsPwaSnoozed,
    () => false,
  );

  useEffect(() => {
    if (promptState === "NATIVE_READY") {
      closeIosPwaModal();
    }
  }, [promptState, closeIosPwaModal]);

  useEffect(() => {
    if (
      promptState === "ALREADY_INSTALLED" ||
      isSnoozed ||
      promptState === "NATIVE_READY" ||
      promptState === "BROWSER_COOLING" ||
      !isAppleSafariInstallContext()
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      openIosPwaModal();
    }, IOS_AUTO_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [promptState, isSnoozed, openIosPwaModal]);

  if (promptState === "ALREADY_INSTALLED" || isSnoozed) {
    return null;
  }

  if (promptState === "NATIVE_READY") {
    return (
      <aside className="fixed bottom-30 left-4 z-50 max-w-xs rounded-2xl border border-[rgba(212,165,116,0.25)] bg-[#4e3d2f] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.7)] lg:bottom-6">
        <p className="font-sans text-[14px] font-medium text-text-primary">
          加到主畫面
        </p>
        <p className="mt-1 font-sans text-[13px] leading-relaxed text-text-secondary">
          安裝 HKCardVault，快速查看即時成交與託管進度。
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onInstall}
            className="flex items-center justify-center gap-2 rounded-md bg-[#d4a574] px-4 py-2.5 font-sans text-xs font-semibold text-[#17130f] transition-all hover:brightness-110 active:scale-[0.98] active:translate-y-px cursor-pointer"
          >
            ⚡ 即刻安裝 PWA
          </button>
          <button
            type="button"
            onClick={snoozePwaPrompt}
            className="flex items-center justify-center rounded-md border border-[rgba(237,232,224,0.15)] px-4 py-2.5 font-sans text-xs font-medium text-text-secondary transition-all hover:border-[rgba(237,232,224,0.3)] active:scale-[0.98] active:translate-y-px cursor-pointer"
          >
            稍後
          </button>
        </div>
      </aside>
    );
  }

  return null;
}
