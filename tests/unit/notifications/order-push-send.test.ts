import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPushToUserMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/push-delivery", () => ({
  sendPushToUser: sendPushToUserMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

import {
  sendMemberOrderPaymentConfirmedSellerPush,
  sendMerchantOrderPaymentConfirmedSellerPush,
  sendMerchantOrderPaymentExpiredBuyerPush,
  sendMerchantOrderShippedBuyerPush,
} from "@/lib/notifications/order-push";

function mockMerchantOrderLookup(
  overrides: Record<string, unknown> = {},
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "order-1",
      buyer_id: "buyer-1",
      merchant_id: "seller-1",
      listing_id: "listing-1",
      buyer_total_amount: 1200,
      total_amount: null,
      final_price: 1200,
      outbound_tracking_no: "SF999",
      outbound_courier_name: "順豐",
      ...overrides,
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockMemberOrderLookup(
  overrides: Record<string, unknown> = {},
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "order-2",
      buyer_id: "buyer-1",
      seller_id: "seller-1",
      listing_id: "listing-1",
      buyer_total_amount: 800,
      total_amount: null,
      final_price: 800,
      ...overrides,
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockListingLookup(
  sellerPersona: "merchant" | "member" = "merchant",
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      seller_persona: sellerPersona,
      product_catalog: { name_zh: "皮卡丘 VMAX", name_ja: "Pikachu" },
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockListingLookupMissing() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: null,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockProfileLookup(displayName = "Ash") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { display_name: displayName, username: "ash" },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockMerchantShopLookup(shopName = "Vault Shop") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { shop_name: shopName, shop_handle: "vault" },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

describe("order push send wiring", () => {
  beforeEach(() => {
    sendPushToUserMock.mockReset();
    fromMock.mockReset();
    sendPushToUserMock.mockResolvedValue(undefined);
  });

  it("P-ORD-01 targets merchant seller after payment", async () => {
    mockMerchantOrderLookup();
    mockListingLookup("merchant");
    mockProfileLookup("Ash");

    await sendMerchantOrderPaymentConfirmedSellerPush("order-1");

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-ORD-01",
        userId: "seller-1",
        path: "/profile/merchant/orderDetail/order-1",
      }),
    );
  });

  it("P-ORD-01 targets member seller with member order detail path", async () => {
    mockMemberOrderLookup();
    mockListingLookup("member");
    mockProfileLookup("Ash");

    await sendMemberOrderPaymentConfirmedSellerPush("order-2");

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-ORD-01",
        userId: "seller-1",
        path: "/profile/user/orderDetail/order-2",
      }),
    );
  });

  it("P-ORD-02 targets buyer after merchant ship", async () => {
    mockMerchantOrderLookup();
    mockListingLookup("merchant");
    mockMerchantShopLookup();

    await sendMerchantOrderShippedBuyerPush("order-1");

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-ORD-02",
        userId: "buyer-1",
        path: "/profile/user/orderDetail/order-1",
      }),
    );
    expect(sendPushToUserMock.mock.calls[0]?.[0].body).toContain("順豐 SF999");
  });

  it("P-ORD-03 targets buyer after payment expiry", async () => {
    mockMerchantOrderLookup();
    mockListingLookup("merchant");

    await sendMerchantOrderPaymentExpiredBuyerPush("order-1");

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-ORD-03",
        userId: "buyer-1",
        path: "/profile/user/trading",
      }),
    );
  });

  it("skips send when listing lookup fails", async () => {
    mockMerchantOrderLookup();
    mockListingLookupMissing();

    await sendMerchantOrderPaymentConfirmedSellerPush("order-1");

    expect(sendPushToUserMock).not.toHaveBeenCalled();
  });
});
