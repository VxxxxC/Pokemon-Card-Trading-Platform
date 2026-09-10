import type { InventoryStatusFilter } from "@/app/lib/inventory/types";

const TAB_CONFIG: {
  id: InventoryStatusFilter;
  label: string;
}[] = [
  { id: "active", label: "上架中" },
  { id: "inactive", label: "未上架" },
  { id: "sold", label: "已售出" },
];

type InventoryStatusTabsProps = {
  activeTab: InventoryStatusFilter;
  counts: Record<InventoryStatusFilter, number>;
  isLoading?: boolean;
  onChange: (tab: InventoryStatusFilter) => void;
};

export function InventoryStatusTabs({
  activeTab,
  counts,
  isLoading = false,
  onChange,
}: InventoryStatusTabsProps) {
  return (
    <div
      className="flex gap-1 overflow-x-auto scrollbar-none px-3 py-2 sm:px-4"
      role="tablist"
      aria-label="掛單狀態"
    >
      {TAB_CONFIG.map(({ id, label }) => {
        const isActive = activeTab === id;
        const count = counts[id];

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`shrink-0 font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors ${
              isActive
                ? "text-brand border-brand/40 bg-brand/10"
                : "text-text-secondary border-[rgba(237,232,224,0.08)] hover:text-text-primary"
            }`}
          >
            {label}
            <span className="tabular-nums">
              {isLoading ? " —" : ` ${count}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function inventoryEmptyMessageForStatus(
  status: InventoryStatusFilter,
): string {
  switch (status) {
    case "active":
      return "暫無上架中商品";
    case "inactive":
      return "暫無未上架商品";
    case "sold":
      return "暫無已售出記錄";
    default:
      return "暫無商品";
  }
}
