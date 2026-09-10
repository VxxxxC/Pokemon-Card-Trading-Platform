"use client";

import {
  FILTER_CHIP_SM_CLASS,
  FORM_SELECT_TRIGGER_CLASS,
  SELECT_CONTENT_CLASS,
  SELECT_ITEM_CLASS,
} from "@/app/admin/campaigns/campaigns-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function SortSelect<V extends string>({
  value,
  options,
  onChange,
  triggerClassName,
  compact = false,
  ariaLabelPrefix = "排序",
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  triggerClassName?: string;
  compact?: boolean;
  ariaLabelPrefix?: string;
}) {
  const labelMap = Object.fromEntries(
    options.map((opt) => [opt.value, opt.label]),
  ) as Record<V, string>;
  const activeLabel = labelMap[value];

  return (
    <Select
      value={value}
      items={labelMap}
      onValueChange={(next) => onChange(next as V)}
    >
      <SelectTrigger
        aria-label={
          activeLabel ? `${ariaLabelPrefix}：${activeLabel}` : ariaLabelPrefix
        }
        title={activeLabel ?? ariaLabelPrefix}
        className={cn(
          FORM_SELECT_TRIGGER_CLASS,
          compact
            ? "h-8 w-auto min-w-0 shrink-0 gap-1 px-2 text-[11px]"
            : "w-44 min-w-44",
          triggerClassName,
        )}
      >
        <SelectValue placeholder="預設排序" />
      </SelectTrigger>
      <SelectContent className={SELECT_CONTENT_CLASS}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={SELECT_ITEM_CLASS}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterChips<K extends string>({
  options,
  active,
  onSelect,
  scrollable = false,
  className,
}: {
  options: { key: K; label: string; count: number }[];
  active: K;
  onSelect: (key: K) => void;
  scrollable?: boolean;
  className?: string;
}) {
  const chipRow = (
    <div
      className={`flex items-center gap-1 ${scrollable ? "flex-nowrap pb-0.5" : "flex-wrap"}`}
    >
      {options.map(({ key, label, count }) => {
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`${FILTER_CHIP_SM_CLASS(selected)} gap-1 ${scrollable ? "shrink-0" : ""}`}
          >
            <span>{label}</span>
            <span
              className={`font-mono text-[9px] tabular-nums ${
                selected ? "text-brand/80" : "text-text-disabled"
              }`}
            >
              {count.toLocaleString("en-US")}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (scrollable) {
    return (
      <div
        className={cn(
          "overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {chipRow}
      </div>
    );
  }

  return <div className={className}>{chipRow}</div>;
}

export function SelectionCountBadge({
  count,
  onClear,
  disabled,
}: {
  count: number;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <span
      className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-brand/25 bg-brand/10 py-0.5 pl-2.5 pr-1 font-mono text-[10px] font-medium text-brand"
    >
      <span className="tabular-nums">{count} 筆已選</span>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="rounded p-0.5 text-brand/70 transition-colors hover:bg-brand/15 hover:text-brand disabled:opacity-50"
        aria-label="清除選取"
      >
        <X className="size-3 shrink-0" aria-hidden="true" />
      </button>
    </span>
  );
}
