import type { CheckoutVariant } from "@/lib/checkout/types";

export type CheckoutVariantConfig = {
  showFulfillmentForm: boolean;
  showAuthToggle: boolean;
  step1Title: string;
  step2Title: string;
};

export const CHECKOUT_VARIANT_CONFIG: Record<
  CheckoutVariant,
  CheckoutVariantConfig
> = {
  merchant_direct: {
    showFulfillmentForm: true,
    showAuthToggle: true,
    step1Title: "訂單確認",
    step2Title: "付款",
  },
  merchant_auth: {
    showFulfillmentForm: false,
    showAuthToggle: false,
    step1Title: "訂單確認",
    step2Title: "付款",
  },
  member_auth: {
    showFulfillmentForm: false,
    showAuthToggle: false,
    step1Title: "訂單確認",
    step2Title: "付款",
  },
};
