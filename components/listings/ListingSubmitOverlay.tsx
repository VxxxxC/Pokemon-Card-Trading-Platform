"use client";

import { useEffect } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Upload,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  useListingSubmitStore,
  type ListingSubmitMode,
  type ListingSubmitPhase,
} from "@/app/store/useListingSubmitStore";
import { cn } from "@/lib/utils";

function modeTitle(mode: ListingSubmitMode): string {
  return mode === "edit" ? "更新商品" : "上架商品";
}

function displayTitle(
  phase: ListingSubmitPhase,
  statusMessage: string,
): string {
  if (phase === "uploading") return "上載相片中";
  return statusMessage;
}

function PhaseIcon({ phase }: { phase: ListingSubmitPhase }) {
  const base =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border";

  if (phase === "success") {
    return (
      <div
        className={cn(
          base,
          "border-brand/25 bg-brand/10 text-brand",
        )}
        aria-hidden="true"
      >
        <Check className="h-5 w-5" strokeWidth={2.25} />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        className={cn(
          base,
          "border-warning/30 bg-warning/10 text-warning",
        )}
        aria-hidden="true"
      >
        <AlertCircle className="h-5 w-5" strokeWidth={2.25} />
      </div>
    );
  }

  if (phase === "uploading") {
    return (
      <div
        className={cn(
          base,
          "border-brand/25 bg-brand/10 text-brand",
        )}
        aria-hidden="true"
      >
        <Upload className="h-4.5 w-4.5" strokeWidth={2.25} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        base,
        "border-brand/25 bg-brand/10 text-brand",
      )}
      aria-hidden="true"
    >
      <Loader2 className="h-4.5 w-4.5 animate-spin" strokeWidth={2.25} />
    </div>
  );
}

export function ListingSubmitOverlay() {
  const isOpen = useListingSubmitStore((state) => state.isOpen);
  const mode = useListingSubmitStore((state) => state.mode);
  const phase = useListingSubmitStore((state) => state.phase);
  const statusMessage = useListingSubmitStore((state) => state.statusMessage);
  const progress = useListingSubmitStore((state) => state.progress);
  const currentImageIndex = useListingSubmitStore(
    (state) => state.currentImageIndex,
  );
  const totalImages = useListingSubmitStore((state) => state.totalImages);
  const error = useListingSubmitStore((state) => state.error);
  const reset = useListingSubmitStore((state) => state.reset);

  useEffect(() => {
    if (phase !== "success") return;

    const timer = window.setTimeout(() => {
      reset();
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [phase, reset]);

  if (!isOpen) return null;

  const isIndeterminate =
    phase === "validating" || (phase === "saving" && progress < 95);
  const displayProgress: number | null =
    phase === "success" ? 100 : isIndeterminate ? null : progress;
  const progressLabel =
    phase === "success"
      ? "100%"
      : isIndeterminate
        ? "處理中"
        : `${progress}%`;
  const title = displayTitle(phase, statusMessage);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="listing-submit-title"
      aria-busy={phase !== "success" && phase !== "error"}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      <div
        className="relative w-full max-w-[17.5rem] rounded-xl border border-[rgba(237,232,224,0.08)] bg-[#26211C] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)] animate-scaleUp"
      >
        <div className="flex items-start gap-3">
          <PhaseIcon phase={phase} />

          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] text-text-disabled tracking-wide">
              {modeTitle(mode)}
            </p>
            <h2
              id="listing-submit-title"
              className="mt-0.5 font-sans text-[15px] font-semibold leading-snug text-text-primary"
            >
              {title}
            </h2>
            {phase === "error" && error ? (
              <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-warning">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        {phase !== "error" ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              {phase === "uploading" && totalImages > 0 ? (
                <span className="font-mono text-[10px] text-text-disabled tabular-nums">
                  相片 {currentImageIndex}/{totalImages}
                </span>
              ) : (
                <span className="font-mono text-[10px] text-text-disabled">
                  進度
                </span>
              )}
              <span className="font-mono text-[10px] text-text-secondary tabular-nums">
                {progressLabel}
              </span>
            </div>
            <Progress
              value={displayProgress}
              className={cn(
                "gap-0 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-brand [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:rounded-full [&_[data-slot=progress-track]]:bg-[#17130f]",
                isIndeterminate &&
                  "[&_[data-slot=progress-indicator]]:w-1/3 [&_[data-slot=progress-indicator]]:animate-pulse",
              )}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="mt-4 h-9 w-full rounded-lg border border-[rgba(237,232,224,0.12)] font-mono text-[12px] font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand active:scale-[0.98]"
          >
            關閉
          </button>
        )}
      </div>
    </div>
  );
}
