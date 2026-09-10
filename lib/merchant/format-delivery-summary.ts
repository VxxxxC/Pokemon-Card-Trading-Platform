import { computeCourierShippingFee } from "@/lib/merchant-checkout/pricing";

export type MerchantShippingQuote = {
  baseCourierShippingFee: number;
  listingExtraShippingFee: number;
  courierTotal: number;
};

export function buildMerchantShippingQuote(input: {
  baseCourierShippingFee: number;
  listingExtraShippingFee: number;
}): MerchantShippingQuote {
  const baseCourierShippingFee = Math.max(
    Math.round(input.baseCourierShippingFee),
    0,
  );
  const listingExtraShippingFee = Math.max(
    Math.round(input.listingExtraShippingFee),
    0,
  );
  const courierTotal = computeCourierShippingFee({
    shippingMethod: "sf",
    baseFee: baseCourierShippingFee,
    extraFee: listingExtraShippingFee,
  });

  return {
    baseCourierShippingFee,
    listingExtraShippingFee,
    courierTotal,
  };
}

export function formatMerchantDeliverySummary(courierTotal: number): string {
  const total = Math.max(Math.round(courierTotal), 0);
  return `快遞 HK$${total.toLocaleString("en-HK")} 起 · 面交免運`;
}

export function resolveMerchantDeliverySummary(
  quote: MerchantShippingQuote | null | undefined,
): string | undefined {
  if (!quote) {
    return undefined;
  }

  return formatMerchantDeliverySummary(quote.courierTotal);
}
