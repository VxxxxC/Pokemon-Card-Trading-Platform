import { buildAbsoluteUrl } from "@/lib/notifications/email-urls";
import type { Tables } from "@/types/supabase";

type WishlistProductCatalog = Pick<
  Tables<"product_catalog">,
  "name_zh" | "name_en" | "name_ja"
>;

export function resolveWishlistProductName(
  catalog: WishlistProductCatalog | undefined,
): string {
  if (!catalog) return "未知卡牌";
  return (
    catalog.name_zh?.trim() ||
    catalog.name_en?.trim() ||
    catalog.name_ja?.trim() ||
    "未知卡牌"
  );
}

export function buildWishlistProductUrl(
  siteUrl: string,
  productId: string,
): string {
  return buildAbsoluteUrl(siteUrl, `/marketplace/product/${productId}`);
}

export function formatHkdPrice(amount: number): string {
  return `HK$${amount.toLocaleString("en-HK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function buildWishlistPriceAlertCopy(input: {
  productName: string;
  gradeLabel: string;
  lowestPrice: number;
  targetPrice: number;
}): { heading: string; body: string } {
  const lowestLabel = formatHkdPrice(input.lowestPrice);
  const targetLabel = formatHkdPrice(input.targetPrice);

  return {
    heading: "願望清單價格提醒",
    body: `${input.productName}（${input.gradeLabel}）已跌至 ${lowestLabel}，低於你的目標價 ${targetLabel}`,
  };
}

export function shouldSendWishlistPriceAlert(
  lowestListingPrice: number | null,
  targetPrice: number,
): boolean {
  if (lowestListingPrice === null || !Number.isFinite(lowestListingPrice)) {
    return false;
  }

  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    return false;
  }

  return lowestListingPrice <= targetPrice;
}

export function isWishlistAlertCooldownActive(
  lastAlertedAt: string | null | undefined,
  now: Date,
  cooldownHours: number,
): boolean {
  if (!lastAlertedAt) {
    return false;
  }

  const lastMs = Date.parse(lastAlertedAt);
  if (!Number.isFinite(lastMs)) {
    return false;
  }

  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  return now.getTime() - lastMs < cooldownMs;
}
