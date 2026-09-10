"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type TradingFilterResetButtonProps = {
  hasActiveFilters: boolean;
  onReset: () => void;
};

export function TradingFilterResetButton({
  hasActiveFilters,
  onReset,
}: TradingFilterResetButtonProps) {
  return (
    <button
      type="button"
      onClick={onReset}
      disabled={!hasActiveFilters}
      className={cn(
        "h-7 w-7 rounded-lg border transition-all flex items-center justify-center shrink-0 select-none focus:outline-none",
        hasActiveFilters
          ? "border-brand/40 text-brand bg-[rgba(212,165,116,0.06)] hover:border-brand hover:bg-[rgba(212,165,116,0.1)] cursor-pointer active:scale-[0.97]"
          : "border-white/5 text-text-disabled bg-[#26211C]/40 opacity-40 cursor-not-allowed",
      )}
      title="重設所有篩選"
      aria-label="重設所有篩選"
    >
      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
    </button>
  );
}
