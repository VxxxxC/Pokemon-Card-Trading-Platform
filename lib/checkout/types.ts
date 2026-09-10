import type { MerchantShippingMethod } from "@/lib/merchant-checkout/pricing";

export type CheckoutVariant =
  | "merchant_direct"
  | "merchant_auth"
  | "member_auth";

export type CheckoutProduct = {
  cardName: string;
  cardNumber: string | null;
  setCode: string;
  displayId: string | null;
  gradeLabel: string;
  imageUrl: string;
};

export type CheckoutCounterparty = {
  name: string;
  handle: string | null;
};

export type CheckoutPricing = {
  itemSubtotal: number;
  shippingFee: number;
  inboundShippingFee?: number;
  outboundShippingFee?: number;
  authFee: number;
  totalAmount: number;
};

export type CheckoutSessionBase = {
  variant: CheckoutVariant;
  orderKind: "merchant" | "member";
  orderId: string;
  orderNumber: string | null;
  listingId: string;
  isPayable: boolean;
  paymentExpiresAt: string | null;
  product: CheckoutProduct;
  counterparty: CheckoutCounterparty;
  pricing: CheckoutPricing;
  platformAuthFeeHkd: number;
};

export type MerchantDirectCheckoutSession = CheckoutSessionBase & {
  variant: "merchant_direct";
  shippingMethod: MerchantShippingMethod | null;
  listingAcceptsAuthentication: boolean;
  requiresAuthentication: boolean;
  baseCourierShippingFee: number;
  listingExtraShippingFee: number;
  courierShippingFeeQuote: number;
};

export type MerchantAuthCheckoutSession = CheckoutSessionBase & {
  variant: "merchant_auth";
};

export type MemberAuthCheckoutSession = CheckoutSessionBase & {
  variant: "member_auth";
};

export type CheckoutSession =
  | MerchantDirectCheckoutSession
  | MerchantAuthCheckoutSession
  | MemberAuthCheckoutSession;

export type CheckoutPaymentStatus = {
  orderId: string;
  orderKind: "merchant" | "member";
  isPaid: boolean;
  isProcessing: boolean;
  orderNumber: string | null;
  totalAmount: number;
};

export type MerchantDirectFormState = {
  shippingType: MerchantShippingMethod;
  buyerPhone: string;
  courierDeliveryAddress: string;
  meetupNote: string;
  buyerRemark: string;
  authServiceEnabled: boolean;
};
