export type ListingCardVariant = "shelf" | "grid" | "merchant";

export type ListingCardTokenSet = {
  body: string;
  topStack: string;
  title: string;
  meta: string;
  price: string;
  action: string;
  imageArea: string;
  buyButton: string;
  ownListingButton: string;
};

/** Vertical listing card shell — marketplace grid + home shelf/grid inner article. */
export const LISTING_CARD_SHELL_CLASS =
  "rounded-lg overflow-hidden bg-[#26211C] border border-white/[0.06] flex flex-col h-full group hover:border-brand/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-all";

/** Marketplace main grid article (motion wrapper adds hover lift). */
export const LISTING_CARD_MARKETPLACE_ARTICLE_CLASS =
  "group bg-[#26211C] rounded-lg overflow-hidden border border-white/[0.06] flex flex-col h-full";

/** Horizontal shelf carousel outer wrapper (New Arrivals track item). */
export const LISTING_CARD_SHELF_WRAPPER_CLASS =
  "shrink-0 w-36 md:w-48 rounded-xl overflow-hidden bg-bg-card border border-[rgba(237,232,224,0.08)]";

/** Merchant carousel card shell. */
export const LISTING_CARD_MERCHANT_SHELL_CLASS =
  "flex flex-col h-full bg-bg-card rounded-xl border border-[rgba(237,232,224,0.08)] overflow-hidden hover:bg-[#26211C] transition-colors group";

export const LISTING_CARD_SHELF_IMAGE_CLASS =
  "relative w-full aspect-5/7 overflow-hidden bg-bg-elevated";

export const LISTING_CARD_GRID_IMAGE_SIZES =
  "(max-width: 640px) 33vw, (max-width: 1280px) 25vw, 20vw";

export const LISTING_CARD_SHELF_IMAGE_SIZES =
  "(max-width: 768px) 144px, 192px";

export const LISTING_CARD_MERCHANT_IMAGE_SIZES =
  "(max-width: 768px) 67vw, 220px";

const GRID_TOKENS: ListingCardTokenSet = {
  body: "flex min-h-0 flex-1 flex-col px-1.5 pt-1.5 pb-1",
  topStack: "space-y-0.5",
  title:
    "font-sans font-semibold text-[12px] text-[#eae1da] truncate leading-tight group-hover:text-brand transition-colors",
  meta: "font-mono text-[9px] text-[#8A8680] truncate leading-tight",
  price:
    "font-mono font-bold text-[12px] text-brand leading-none tabular-nums shrink-0",
  action: "px-1.5 pb-1.5 pt-0.5",
  imageArea: "relative w-full aspect-[3/4] overflow-hidden bg-[#17130f]",
  buyButton: "w-full h-7 px-1 text-[10px]",
  ownListingButton:
    "w-full h-7 px-1 bg-[#1A1612] text-brand/70 font-sans font-bold text-[10px] tracking-wide whitespace-nowrap truncate rounded-lg cursor-not-allowed flex items-center justify-center gap-0.5",
};

const COMFORTABLE_TOKENS: ListingCardTokenSet = {
  body: "flex min-h-0 flex-1 flex-col p-3",
  topStack: "space-y-1",
  title:
    "font-sans font-bold text-[13px] text-text-primary truncate leading-tight group-hover:text-brand transition-colors",
  meta: "font-mono text-[10px] text-text-disabled truncate leading-tight",
  price:
    "font-mono font-bold text-[14px] text-brand leading-none tabular-nums shrink-0",
  action: "px-3 pb-3 pt-0.5",
  imageArea: LISTING_CARD_SHELF_IMAGE_CLASS,
  buyButton: "w-full py-1 h-8 text-[12px]",
  ownListingButton:
    "w-full py-1 h-8 bg-[#1A1612] text-brand/70 font-sans font-bold text-[12px] tracking-wide whitespace-nowrap truncate rounded-lg cursor-not-allowed flex items-center justify-center gap-0.5",
};

const MERCHANT_TOKENS: ListingCardTokenSet = {
  ...COMFORTABLE_TOKENS,
  imageArea:
    "relative w-full aspect-[3/4] overflow-hidden bg-bg-elevated border-b border-white/5",
};

export function getListingCardTokens(
  variant: ListingCardVariant,
): ListingCardTokenSet {
  if (variant === "grid") return GRID_TOKENS;
  if (variant === "merchant") return MERCHANT_TOKENS;
  return COMFORTABLE_TOKENS;
}
