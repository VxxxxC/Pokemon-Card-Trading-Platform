export const FILTER_CHIP_CLASS = (active: boolean) =>
  `inline-flex h-9 min-h-[36px] items-center justify-center rounded-lg border px-3.5 py-1.5 font-sans text-[12px] transition-colors active:scale-[0.98] ${
    active
      ? "border-brand/40 bg-brand/15 font-semibold text-brand"
      : "border-white/10 text-text-secondary hover:border-brand/30 hover:bg-brand/10 hover:text-brand"
  }`;

export const FILTER_CHIP_SM_CLASS = (active: boolean) =>
  `inline-flex h-7 min-h-7 items-center justify-center rounded-md border px-2.5 py-0.5 font-sans text-[11px] transition-colors active:scale-[0.98] ${
    active
      ? "border-brand/40 bg-brand/15 font-semibold text-brand"
      : "border-white/10 text-text-secondary hover:border-brand/30 hover:bg-brand/10 hover:text-brand"
  }`;

/** Primary page-level view switch — underline tabs (not pill chips). */
export const ADMIN_PAGE_TAB_NAV_CLASS =
  "flex min-w-0 gap-0 overflow-x-auto border-b border-white/[0.08] scrollbar-none";

export const ADMIN_PAGE_TAB_CLASS = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-0.5 font-sans text-[13px] transition-colors border-b-2 -mb-px active:scale-[0.98] ${
    active
      ? "border-brand font-semibold text-brand"
      : "border-transparent text-text-secondary hover:text-text-primary"
  }`;

export const FILTER_INPUT_CLASS =
  "h-9 rounded-lg border border-white/10 bg-transparent pl-9 pr-8 text-[12px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none";

export const BTN_OUTLINE_CLASS =
  "inline-flex h-9 items-center justify-center rounded-lg border border-[rgba(237,232,224,0.12)] bg-transparent px-4 font-sans font-semibold text-[12px] text-text-secondary shadow-none transition-colors hover:bg-brand/10 hover:border-brand/30 hover:text-brand active:scale-[0.98]";

export const BTN_PRIMARY_CLASS =
  "inline-flex h-9 items-center justify-center rounded-lg bg-brand px-4 font-sans font-bold text-[12px] text-[#17130f] shadow-none transition-colors hover:bg-brand-hover border-0 active:scale-[0.98]";

export const BTN_OUTLINE_SM_CLASS =
  "inline-flex h-8 items-center justify-center rounded-lg border border-[rgba(237,232,224,0.12)] bg-transparent px-3 font-sans font-semibold text-[11px] text-text-secondary shadow-none transition-colors hover:bg-brand/10 hover:border-brand/30 hover:text-brand active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

export const BTN_PRIMARY_SM_CLASS =
  "inline-flex h-8 items-center justify-center rounded-lg bg-brand px-3 font-sans font-bold text-[11px] text-[#17130f] shadow-none transition-colors hover:bg-brand-hover border-0 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

export const FORM_SECTION_CLASS =
  "font-sans text-[11px] font-medium uppercase tracking-wide text-text-disabled";

export const FORM_LABEL_CLASS = "font-mono text-[11px] text-text-secondary";

export const FORM_INPUT_CLASS =
  "h-9 rounded-lg border border-white/10 bg-transparent px-3 font-sans text-[13px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none";

export const FORM_DATE_INPUT_CLASS = `${FORM_INPUT_CLASS} input-date-theme`;

export const FORM_INPUT_MONO_CLASS = `${FORM_INPUT_CLASS} font-mono`;

export const FORM_SELECT_TRIGGER_CLASS =
  "h-9 w-full min-w-0 border-white/10 bg-transparent text-[13px] text-text-primary focus-visible:border-brand/40 focus-visible:ring-brand/40";

export const SELECT_CONTENT_CLASS = "border-white/10 bg-bg-card";

export const SELECT_ITEM_CLASS =
  "text-text-secondary focus:bg-brand/10 focus:text-brand";

export const FORM_TOGGLE_ROW_CLASS =
  "flex items-center justify-between gap-3 rounded-lg border border-white/[0.08] bg-bg-page/40 px-3 py-2.5";

export const FORM_SWITCH_CLASS =
  "shrink-0 data-checked:bg-brand data-unchecked:bg-bg-elevated";

export const TABLE_FOOTER_CLASS =
  "border-t border-white/[0.06] bg-brand/10 font-medium";

export const FORM_STICKY_FOOTER_CLASS =
  "sticky bottom-0 z-10 -mx-4 border-t border-white/[0.08] bg-[#17130f]/95 px-4 py-2.5 backdrop-blur-sm lg:-mx-6 lg:px-6";

export const FORM_PAGE_BACK_LINK_CLASS =
  "inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary transition-colors hover:text-brand active:scale-[0.98]";

export const FORM_TEXTAREA_CLASS =
  "min-h-[10rem] w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 font-sans text-[12px] leading-relaxed text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none resize-y disabled:opacity-50";

export {
  CALENDAR_POPOVER_CONTENT_CLASS,
  CALENDAR_TRIGGER_ICON_CLASS,
  INPUT_DATE_THEME_CLASS,
} from "@/lib/ui/calendar-theme";
