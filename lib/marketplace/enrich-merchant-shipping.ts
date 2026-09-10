import {
  buildMerchantShippingQuote,
  type MerchantShippingQuote,
} from "@/lib/merchant/format-delivery-summary";
import { PLATFORM_DEFAULT_COURIER_SHIPPING_FEE } from "@/lib/merchant/shipping-fee";
import type { Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type SellerPersona = Database["public"]["Enums"]["seller_persona_type"];

export type ShippingQuoteSupabase = Pick<SupabaseClient<Database>, "from">;

export type MerchantShippingQuoteInput = {
  listingId: string;
  sellerId: string;
  sellerPersona: SellerPersona;
};

type ListingShippingRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "id" | "extra_shipping_fee" | "seller_id"
>;

type ShopShippingRow = Pick<
  Database["public"]["Tables"]["merchant_shops"]["Row"],
  "merchant_id" | "base_courier_shipping_fee"
>;

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function loadMerchantShippingQuotes(
  supabase: ShippingQuoteSupabase,
  items: MerchantShippingQuoteInput[],
): Promise<Map<string, MerchantShippingQuote>> {
  const merchantItems = items.filter(
    (item) =>
      item.sellerPersona === "merchant" &&
      item.listingId.trim().length > 0 &&
      item.sellerId.trim().length > 0,
  );

  const quotes = new Map<string, MerchantShippingQuote>();
  if (merchantItems.length === 0) {
    return quotes;
  }

  const listingIds = uniqueNonEmpty(merchantItems.map((item) => item.listingId));
  const merchantIds = uniqueNonEmpty(merchantItems.map((item) => item.sellerId));

  const [{ data: listingRows, error: listingError }, { data: shopRows, error: shopError }] =
    await Promise.all([
      supabase
        .from("listings")
        .select("id, extra_shipping_fee, seller_id")
        .in("id", listingIds)
        .returns<ListingShippingRow[]>(),
      supabase
        .from("merchant_shops")
        .select("merchant_id, base_courier_shipping_fee")
        .in("merchant_id", merchantIds)
        .returns<ShopShippingRow[]>(),
    ]);

  if (listingError) {
    console.error(
      "[loadMerchantShippingQuotes] listings",
      listingError.message,
    );
  }

  if (shopError) {
    console.error("[loadMerchantShippingQuotes] merchant_shops", shopError.message);
  }

  const extraByListingId = new Map<string, number>();
  for (const row of listingRows ?? []) {
    extraByListingId.set(
      row.id,
      Math.max(Math.round(Number(row.extra_shipping_fee ?? 0)), 0),
    );
  }

  const baseByMerchantId = new Map<string, number>();
  for (const row of shopRows ?? []) {
    const base = Number(row.base_courier_shipping_fee);
    baseByMerchantId.set(
      row.merchant_id,
      Number.isFinite(base)
        ? Math.max(Math.round(base), 0)
        : PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
    );
  }

  for (const item of merchantItems) {
    const listingId = item.listingId.trim();
    const merchantId = item.sellerId.trim();
    const quote = buildMerchantShippingQuote({
      baseCourierShippingFee:
        baseByMerchantId.get(merchantId) ?? PLATFORM_DEFAULT_COURIER_SHIPPING_FEE,
      listingExtraShippingFee: extraByListingId.get(listingId) ?? 0,
    });
    quotes.set(listingId, quote);
  }

  return quotes;
}
