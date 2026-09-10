export const BTN_OUTLINE_CLASS =
  "border-[rgba(237,232,224,0.12)] bg-transparent hover:border-brand/30 hover:bg-brand/10 hover:text-brand text-text-primary text-[12px] active:scale-[0.98]";

export const BTN_PRIMARY_CLASS =
  "h-10 w-full bg-brand text-[#111] hover:bg-brand/90 active:scale-[0.98]";

export const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-white/10 bg-transparent px-3 text-[13px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none disabled:opacity-50";

export const TEXTAREA_CLASS =
  "w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-[13px] text-text-primary placeholder:text-text-disabled focus-visible:border-brand/40 focus-visible:ring-2 focus-visible:ring-brand/40 outline-none disabled:opacity-50";

export const SELECT_TRIGGER_CLASS =
  "h-10 w-full border-white/10 bg-transparent text-text-primary focus-visible:border-brand/40 focus-visible:ring-brand/40";

export const SELECT_CONTENT_CLASS = "border-white/10 bg-bg-card";

export const SELECT_ITEM_CLASS = "text-text-secondary focus:bg-brand/10 focus:text-brand";

/** Flat section rhythm — divider only, no card chrome */
export const SECTION_BLOCK_CLASS =
  "space-y-2 border-b border-white/[0.06] pb-4 last:border-b-0";

/** Section divider that stays visible before the next column block (e.g. chat → orders on mobile) */
export const SECTION_DIVIDER_CLASS =
  "space-y-2 border-b border-white/[0.06] pb-4";

export { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

export const META_TEXT_CLASS =
  "font-sans text-[11px] text-text-disabled";

/** Compact chips — unified size/font for case header meta row */
export const MODERATION_META_BADGE_CLASS =
  "h-5 rounded-full px-2 text-[10px] font-sans font-medium leading-none";

/** Expanded accordion / toggle body */
export const EXPANDED_CONTENT_CLASS =
  "mt-2 rounded-lg border border-white/[0.06] bg-bg-card/20 px-3 py-3";
