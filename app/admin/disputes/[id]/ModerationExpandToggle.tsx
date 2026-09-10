"use client";

import { ChevronDown } from "lucide-react";

const TOGGLE_CLASS =
  "flex shrink-0 items-center justify-center rounded-md p-1 text-text-disabled transition-colors hover:text-text-primary";

type ModerationExpandToggleProps = {
  open: boolean;
  onToggle: () => void;
  label?: string;
};

export function ModerationExpandToggle({
  open,
  onToggle,
  label,
}: ModerationExpandToggleProps) {
  const ariaLabel = label ?? (open ? "收合" : "展開");

  return (
    <button
      type="button"
      onClick={onToggle}
      className={TOGGLE_CLASS}
      aria-label={ariaLabel}
      aria-expanded={open}
    >
      <ChevronDown
        className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}
