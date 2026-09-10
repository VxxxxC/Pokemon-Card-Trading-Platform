export const TRADING_DEFAULT_PAGE_SIZE = 20;
export const TRADING_MOBILE_PAGE_SIZE = 20;
export const TRADING_MOBILE_BREAKPOINT_PX = 768;
export const TRADING_SEARCH_DEBOUNCE_MS = 300;

export type PersonaFilter = "all" | "buy" | "sell";
export type TabStatusFilter = "all" | "pending" | "completed" | "cancelled";

export const TAB_STATUS_FROM_PARAM: Record<string, TabStatusFilter> = {
  全部: "all",
  待處理: "pending",
  已完成: "completed",
  已取消: "cancelled",
};

export const TAB_STATUS_TO_PARAM: Record<TabStatusFilter, string> = {
  all: "全部",
  pending: "待處理",
  completed: "已完成",
  cancelled: "已取消",
};

export const PERSONA_OPTIONS: { value: PersonaFilter; label: string }[] = [
  { value: "all", label: "不限" },
  { value: "buy", label: "買單" },
  { value: "sell", label: "賣單" },
];

export const STATUS_OPTIONS: { value: TabStatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待處理" },
  { value: "completed", label: "已完成" },
  { value: "cancelled", label: "已取消" },
];

export const PENDING_ACTION_STATUSES = new Set(["pending"]);
