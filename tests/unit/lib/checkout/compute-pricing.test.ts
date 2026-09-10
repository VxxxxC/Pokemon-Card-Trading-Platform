import { describe, expect, it } from "vitest";
import {
  AUTH_ESCROW_SF_LEG_FEE_HKD,
  estimateAuthEscrowCheckoutTotal,
} from "@/lib/auth-escrow/defaults";
import { resolveCheckoutDisplayPricing } from "@/lib/checkout/compute-pricing";
import type {
  MemberAuthCheckoutSession,
  MerchantAuthCheckoutSession,
  MerchantDirectCheckoutSession,
} from "@/lib/checkout/types";

const PLATFORM_AUTH_FEE = 150;

function buildMemberAuthSession(
  pricing: MemberAuthCheckoutSession["pricing"],
): MemberAuthCheckoutSession {
  return {
    variant: "member_auth",
    orderKind: "member",
    orderId: "order-1",
    orderNumber: "ORD-1",
    isPayable: true,
    paymentExpiresAt: null,
    product: {
      cardName: "Test Card",
      cardNumber: "001",
      setCode: "SV1",
      displayId: "001",
      gradeLabel: "PSA 10",
      imageUrl: "/placeholder.png",
    },
    counterparty: { name: "Seller", handle: "seller" },
    pricing,
    platformAuthFeeHkd: PLATFORM_AUTH_FEE,
  };
}

function buildMerchantAuthSession(
  pricing: MerchantAuthCheckoutSession["pricing"],
): MerchantAuthCheckoutSession {
  return {
    variant: "merchant_auth",
    orderKind: "merchant",
    orderId: "order-2",
    orderNumber: "M-ORD-2",
    isPayable: true,
    paymentExpiresAt: null,
    product: {
      cardName: "Merchant Card",
      cardNumber: "002",
      setCode: "SV2",
      displayId: "002",
      gradeLabel: "PSA 9",
      imageUrl: "/placeholder.png",
    },
    counterparty: { name: "Shop", handle: "shop" },
    pricing,
    platformAuthFeeHkd: PLATFORM_AUTH_FEE,
  };
}

function buildMerchantDirectSession(
  overrides?: Partial<MerchantDirectCheckoutSession>,
): MerchantDirectCheckoutSession {
  return {
    variant: "merchant_direct",
    orderKind: "merchant",
    orderId: "order-3",
    orderNumber: "M-ORD-3",
    isPayable: true,
    paymentExpiresAt: null,
    product: {
      cardName: "Direct Card",
      cardNumber: "003",
      setCode: "SV3",
      displayId: "003",
      gradeLabel: "RAW",
      imageUrl: "/placeholder.png",
    },
    counterparty: { name: "Shop", handle: "shop" },
    pricing: {
      itemSubtotal: 200,
      shippingFee: 35,
      inboundShippingFee: 0,
      outboundShippingFee: 0,
      authFee: 0,
      totalAmount: 235,
    },
    platformAuthFeeHkd: PLATFORM_AUTH_FEE,
    shippingMethod: "sf",
    listingAcceptsAuthentication: true,
    requiresAuthentication: false,
    baseCourierShippingFee: 30,
    listingExtraShippingFee: 5,
    courierShippingFeeQuote: 35,
    ...overrides,
  };
}

describe("resolveCheckoutDisplayPricing", () => {
  it("fills auth escrow SF legs when DB snapshot is still 0 before prepare (member_auth)", () => {
    const session = buildMemberAuthSession({
      itemSubtotal: 100,
      shippingFee: 0,
      inboundShippingFee: 0,
      outboundShippingFee: 0,
      authFee: 0,
      totalAmount: 0,
    });

    const pricing = resolveCheckoutDisplayPricing(session);

    expect(pricing.inboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.outboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.authFee).toBe(PLATFORM_AUTH_FEE);
    expect(pricing.totalAmount).toBe(
      estimateAuthEscrowCheckoutTotal(100, PLATFORM_AUTH_FEE),
    );
  });

  it("keeps persisted auth escrow leg fees after prepare (member_auth)", () => {
    const session = buildMemberAuthSession({
      itemSubtotal: 100,
      shippingFee: 0,
      inboundShippingFee: 30,
      outboundShippingFee: 25,
      authFee: 150,
      totalAmount: 305,
    });

    const pricing = resolveCheckoutDisplayPricing(session);

    expect(pricing.inboundShippingFee).toBe(30);
    expect(pricing.outboundShippingFee).toBe(25);
    expect(pricing.totalAmount).toBe(305);
  });

  it("fills auth escrow SF legs when DB snapshot is still 0 before prepare (merchant_auth)", () => {
    const session = buildMerchantAuthSession({
      itemSubtotal: 250,
      shippingFee: 0,
      inboundShippingFee: 0,
      outboundShippingFee: 0,
      authFee: 0,
      totalAmount: 0,
    });

    const pricing = resolveCheckoutDisplayPricing(session);

    expect(pricing.inboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.outboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.authFee).toBe(PLATFORM_AUTH_FEE);
    expect(pricing.totalAmount).toBe(
      estimateAuthEscrowCheckoutTotal(250, PLATFORM_AUTH_FEE),
    );
  });

  it("applies coupon subsidy to merchant_auth checkout total", () => {
    const session = buildMerchantAuthSession({
      itemSubtotal: 500,
      shippingFee: 0,
      inboundShippingFee: 0,
      outboundShippingFee: 0,
      authFee: 0,
      totalAmount: 0,
    });

    const pricing = resolveCheckoutDisplayPricing(session, undefined, {
      platformSubsidy: 50,
    });

    expect(pricing.platformSubsidy).toBe(50);
    expect(pricing.totalAmount).toBe(
      estimateAuthEscrowCheckoutTotal(500, PLATFORM_AUTH_FEE) - 50,
    );
  });

  it("merchant_direct without auth uses courier shipping fee only", () => {
    const session = buildMerchantDirectSession();
    const pricing = resolveCheckoutDisplayPricing(session, {
      shippingType: "sf",
      buyerPhone: "",
      courierDeliveryAddress: "",
      meetupNote: "",
      buyerRemark: "",
      authServiceEnabled: false,
    });

    expect(pricing.shippingFee).toBe(35);
    expect(pricing.inboundShippingFee).toBe(0);
    expect(pricing.outboundShippingFee).toBe(0);
    expect(pricing.authFee).toBe(0);
    expect(pricing.totalAmount).toBe(235);
  });

  it("merchant_direct with auth toggle uses SF legs and platform auth fee", () => {
    const session = buildMerchantDirectSession();
    const pricing = resolveCheckoutDisplayPricing(session, {
      shippingType: "sf",
      buyerPhone: "",
      courierDeliveryAddress: "",
      meetupNote: "",
      buyerRemark: "",
      authServiceEnabled: true,
    });

    expect(pricing.shippingFee).toBe(0);
    expect(pricing.inboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.outboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.authFee).toBe(PLATFORM_AUTH_FEE);
    expect(pricing.totalAmount).toBe(
      estimateAuthEscrowCheckoutTotal(200, PLATFORM_AUTH_FEE),
    );
  });

  it("merchant_direct auth toggle ignores meetup shipping selection", () => {
    const session = buildMerchantDirectSession();
    const pricing = resolveCheckoutDisplayPricing(session, {
      shippingType: "meetup",
      buyerPhone: "",
      courierDeliveryAddress: "",
      meetupNote: "",
      buyerRemark: "",
      authServiceEnabled: true,
    });

    expect(pricing.shippingFee).toBe(0);
    expect(pricing.inboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
    expect(pricing.outboundShippingFee).toBe(AUTH_ESCROW_SF_LEG_FEE_HKD);
  });
});
