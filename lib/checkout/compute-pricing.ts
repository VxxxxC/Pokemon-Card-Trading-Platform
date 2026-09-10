import {
  AUTH_ESCROW_SF_LEG_FEE_HKD,
  estimateAuthEscrowCheckoutTotal,
  resolveAuthEscrowSfLegFeeHkd,
} from "@/lib/auth-escrow/defaults";
import { computeCourierShippingFee } from "@/lib/merchant-checkout/pricing";
import type {
  CheckoutSession,
  MerchantDirectCheckoutSession,
  MerchantDirectFormState,
} from "@/lib/checkout/types";

export function computeMerchantDirectPricing(
  session: MerchantDirectCheckoutSession,
  form: MerchantDirectFormState,
  options?: { platformSubsidy?: number },
): {
  shippingFee: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
  authFee: number;
  grossTotalAmount: number;
  platformSubsidy: number;
  totalAmount: number;
} {
  const platformAuthFeeHkd = session.platformAuthFeeHkd;
  const showDirectDelivery = !form.authServiceEnabled;
  const shippingFee =
    !showDirectDelivery || form.shippingType !== "sf"
      ? 0
      : computeCourierShippingFee({
          shippingMethod: "sf",
          baseFee: session.baseCourierShippingFee,
          extraFee: session.listingExtraShippingFee,
        });
  const inboundShippingFee = form.authServiceEnabled
    ? AUTH_ESCROW_SF_LEG_FEE_HKD
    : 0;
  const outboundShippingFee = form.authServiceEnabled
    ? AUTH_ESCROW_SF_LEG_FEE_HKD
    : 0;
  const authFee = form.authServiceEnabled ? platformAuthFeeHkd : 0;
  const grossTotalAmount = form.authServiceEnabled
    ? estimateAuthEscrowCheckoutTotal(
        session.pricing.itemSubtotal,
        platformAuthFeeHkd,
      )
    : session.pricing.itemSubtotal + shippingFee + authFee;
  const platformSubsidy = Math.max(0, Number(options?.platformSubsidy ?? 0));
  const totalAmount = Math.max(0, grossTotalAmount - platformSubsidy);

  return {
    shippingFee,
    inboundShippingFee,
    outboundShippingFee,
    authFee,
    grossTotalAmount,
    platformSubsidy,
    totalAmount,
  };
}

function resolveAuthCheckoutPricing(session: CheckoutSession): {
  shippingFee: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
  authFee: number;
  grossTotalAmount: number;
  platformSubsidy: number;
  totalAmount: number;
} {
  const inboundShippingFee = resolveAuthEscrowSfLegFeeHkd(
    session.pricing.inboundShippingFee,
  );
  const outboundShippingFee = resolveAuthEscrowSfLegFeeHkd(
    session.pricing.outboundShippingFee,
  );
  const authFee =
    session.pricing.authFee > 0
      ? session.pricing.authFee
      : session.platformAuthFeeHkd;
  const grossTotalAmount =
    session.pricing.itemSubtotal +
    authFee +
    inboundShippingFee +
    outboundShippingFee;

  return {
    shippingFee: 0,
    inboundShippingFee,
    outboundShippingFee,
    authFee,
    grossTotalAmount,
    platformSubsidy: 0,
    totalAmount: session.pricing.totalAmount || grossTotalAmount,
  };
}

export function resolveCheckoutDisplayPricing(
  session: CheckoutSession,
  form?: MerchantDirectFormState,
  options?: { platformSubsidy?: number },
): {
  shippingFee: number;
  inboundShippingFee: number;
  outboundShippingFee: number;
  authFee: number;
  grossTotalAmount: number;
  platformSubsidy: number;
  totalAmount: number;
} {
  if (session.variant === "merchant_direct" && form) {
    return computeMerchantDirectPricing(session, form, options);
  }

  if (
    session.variant === "merchant_auth" ||
    session.variant === "member_auth"
  ) {
    const authPricing = resolveAuthCheckoutPricing(session);
    const platformSubsidy = Math.max(0, Number(options?.platformSubsidy ?? 0));
    return {
      ...authPricing,
      platformSubsidy,
      totalAmount: Math.max(0, authPricing.grossTotalAmount - platformSubsidy),
    };
  }

  return {
    shippingFee: session.pricing.shippingFee,
    inboundShippingFee: 0,
    outboundShippingFee: 0,
    authFee: session.pricing.authFee,
    grossTotalAmount: session.pricing.totalAmount,
    platformSubsidy: 0,
    totalAmount: session.pricing.totalAmount,
  };
}
