export const FILTER_CHIP_CLASS = (active: boolean) =>
  `inline-flex h-9 min-h-[36px] items-center justify-center rounded-lg border px-3.5 py-1.5 font-sans text-[12px] transition-colors active:scale-[0.98] ${
    active
      ? "border-brand/40 bg-brand/15 font-semibold text-brand"
      : "border-white/10 text-text-secondary hover:border-brand/30 hover:bg-brand/10 hover:text-brand"
  }`;

export const FILTER_CHIP_SM_CLASS = (active: boolean) =>
  `inline-flex h-7 min-h-7 shrink-0 items-center justify-center rounded-md border px-2.5 py-0.5 font-sans text-[11px] transition-colors active:scale-[0.98] ${
    active
      ? "border-brand/40 bg-brand/15 font-semibold text-brand"
      : "border-white/10 text-text-secondary hover:border-brand/30 hover:bg-brand/10 hover:text-brand"
  }`;

export const FILTER_SEARCH_CLASS =
  "h-9 w-full rounded-lg border border-white/10 bg-transparent pl-9 text-[12px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none";

export const FILTER_INPUT_CLASS =
  "h-9 rounded-lg border border-white/10 bg-transparent px-3 text-[12px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none";

export const FILTER_SELECT_TRIGGER_CLASS =
  "h-9 min-w-[7.5rem] border-white/10 bg-transparent text-[12px] text-text-primary focus-visible:border-brand/40 focus-visible:ring-brand/40";

export const SELECT_CONTENT_CLASS = "border-white/10 bg-bg-card";

export const SELECT_ITEM_CLASS =
  "text-text-secondary focus:bg-brand/10 focus:text-brand";

export const MANUAL_LABEL_CLASS =
  "font-sans text-[11px] text-text-disabled";

export { SECTION_TITLE_CLASS as MANUAL_SECTION_CLASS } from "@/lib/ui/section-title-ui";

export const MANUAL_FORM_BLOCK_CLASS =
  "space-y-2.5 rounded-lg border border-white/[0.06] bg-bg-page/30 p-3";

export const MANUAL_INPUT_CLASS =
  "h-9 rounded-lg border border-white/10 bg-transparent px-3 font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none";

export const MANUAL_INPUT_MONO_CLASS =
  `${MANUAL_INPUT_CLASS} font-mono`;

export const MANUAL_SELECT_TRIGGER_CLASS =
  "h-9 w-full min-w-0 border-white/10 bg-transparent text-[13px] text-text-primary focus-visible:border-brand/40 focus-visible:ring-brand/40";

export const MANUAL_FIELD_ERROR_CLASS = "border-warning focus-visible:border-warning";
