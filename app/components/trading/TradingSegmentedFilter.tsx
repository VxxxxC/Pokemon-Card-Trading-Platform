"use client";

import { cn } from "@/lib/utils";

export type SegmentedFilterOption<T extends string> = {
  value: T;
  label: string;
  count: number;
};

export function TradingSegmentedFilter<T extends string>({
  options,
  value,
  onChange,
  columns,
  pendingValue,
  ariaLabelledBy,
}: {
  options: SegmentedFilterOption<T>[];
  value: T;
  onChange: (next: T) => void;
  columns: 3 | 4;
  pendingValue?: T;
  ariaLabelledBy?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "grid gap-0.5 bg-[#17130f] rounded-lg p-0.5 border border-white/[0.06]",
        columns === 4 ? "grid-cols-4" : "grid-cols-3",
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        const isPending = pendingValue != null && option.value === pendingValue;
        const displayLabel =
          option.count > 0 ? `${option.label} (${option.count})` : option.label;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-0 rounded-md px-1 py-1.5 transition-colors cursor-pointer font-mono text-[10px] leading-tight truncate",
              isActive
                ? isPending
                  ? "bg-[rgba(239,68,68,0.12)] text-warning font-bold"
                  : "bg-[rgba(212,165,116,0.14)] text-brand font-bold"
                : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]",
            )}
          >
            {displayLabel}
          </button>
        );
      })}
    </div>
  );
}
