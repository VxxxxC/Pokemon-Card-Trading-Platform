"use client";

import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

type PushOptInBannerProps = {
  onEnable: () => void;
  onSnooze: () => void;
  isEnabling: boolean;
};

export function PushOptInBanner({
  onEnable,
  onSnooze,
  isEnabling,
}: PushOptInBannerProps) {
  return (
    <div
      role="dialog"
      aria-labelledby="push-optin-title"
      aria-describedby="push-optin-desc"
      className="fixed z-[60] inset-x-4 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-sm rounded-xl border border-border-subtle bg-bg-elevated/98 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.55)] animate-fadeIn"
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="min-w-0">
          <p
            id="push-optin-title"
            className={SECTION_TITLE_CLASS}
          >
            開啟推送通知
          </p>
          <p
            id="push-optin-desc"
            className="font-mono text-[10px] text-text-secondary mt-1 leading-relaxed"
          >
            即時接收訂單、報價同價格提醒。撳「開啟通知」後會彈出瀏覽器權限視窗。
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSnooze}
            disabled={isEnabling}
            className="h-8 px-3 rounded-md border border-border-subtle text-text-secondary font-sans text-[11px] hover:text-text-primary transition-colors disabled:opacity-50"
          >
            稍後
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={isEnabling}
            className="h-8 px-4 rounded-md bg-brand text-[#17130f] font-sans font-bold text-[11px] hover:bg-brand-hover transition-colors disabled:opacity-50"
          >
            {isEnabling ? "處理中…" : "開啟通知"}
          </button>
        </div>
      </div>
    </div>
  );
}
