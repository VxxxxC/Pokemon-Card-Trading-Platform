"use client";

import { Spinner } from "@/components/ui/spinner";

type BlockingLoadingOverlayProps = {
  open: boolean;
  message?: string;
};

export default function BlockingLoadingOverlay({
  open,
  message = "正在處理，請稍候…",
}: BlockingLoadingOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#17130f]/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[rgba(237,232,224,0.12)] bg-bg-card px-8 py-6 shadow-2xl">
        <Spinner className="size-8 text-brand" />
        <p className="font-sans text-sm text-text-primary">{message}</p>
      </div>
    </div>
  );
}
