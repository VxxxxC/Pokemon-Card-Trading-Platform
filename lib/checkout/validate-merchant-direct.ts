import type { MerchantDirectFormState } from "@/lib/checkout/types";

export function validateMerchantDirectForm(
  form: MerchantDirectFormState,
  showFulfillmentForm: boolean,
): string | null {
  if (!showFulfillmentForm || form.authServiceEnabled) {
    return null;
  }

  if (
    form.shippingType === "sf" &&
    (!form.buyerPhone.trim() || !form.courierDeliveryAddress.trim())
  ) {
    return "請填寫聯絡電話及收件地址／自提點。";
  }

  if (form.shippingType === "meetup" && !form.buyerPhone.trim()) {
    return "請填寫聯絡電話。";
  }

  return null;
}
