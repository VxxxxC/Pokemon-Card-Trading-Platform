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
  sendBuyNowSellerPush,
  sendOfferAcceptedPush,
  sendOfferReceivedPush,
  sendOfferRejectedPush,
} from "@/lib/notifications/offer-push";

function mockListingLookup(
  sellerPersona: "merchant" | "member" = "member",
) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      seller_id: "seller-1",
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

function mockMerchantShopLookup(shopName = "Card Vault Shop") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { shop_name: shopName, shop_handle: "cardvault" },
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

function mockOfferLookup() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      buyer_id: "buyer-1",
      listing_id: "listing-1",
      offer_price: 1200,
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockOfferLookupMissing() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: null,
    error: { message: "not found" },
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

describe("offer push send wiring", () => {
  beforeEach(() => {
    sendPushToUserMock.mockReset();
    fromMock.mockReset();
    sendPushToUserMock.mockResolvedValue(undefined);
  });

  it("P-OFF-01 targets seller after new offer", async () => {
    mockListingLookup();
    mockProfileLookup("Ash");

    await sendOfferReceivedPush({
      listingId: "listing-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      offerPrice: 1200,
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-OFF-01",
        userId: "seller-1",
        heading: "收到新出價",
        path: "/profile/user/trading",
      }),
    );
    expect(sendPushToUserMock.mock.calls[0]?.[0].body).toContain("Ash");
    expect(sendPushToUserMock.mock.calls[0]?.[0].body).toContain("HK$1,200");
  });

  it("P-OFF-02 targets buyer after offer accepted", async () => {
    mockOfferLookup();
    mockListingLookup();
    mockProfileLookup("Misty");

    await sendOfferAcceptedPush({
      offerId: "offer-1",
      orderId: "order-1",
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-OFF-02",
        userId: "buyer-1",
        heading: "出價已被接受",
        path: "/profile/user/orderDetail/order-1",
      }),
    );
  });

  it("P-OFF-03 targets buyer after offer rejected", async () => {
    mockListingLookup();
    mockProfileLookup("Misty");

    await sendOfferRejectedPush({
      buyerId: "buyer-1",
      listingId: "listing-1",
      sellerId: "seller-1",
      offerPrice: 1200,
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-OFF-03",
        userId: "buyer-1",
        heading: "出價已被拒絕",
        path: "/profile/user/trading",
      }),
    );
  });

  it("P-OFF-04 targets seller after buy now", async () => {
    mockListingLookup();
    mockProfileLookup("Ash");

    await sendBuyNowSellerPush({
      listingId: "listing-1",
      sellerId: "seller-1",
      buyerId: "buyer-1",
      orderId: "order-9",
      offerPrice: 1500,
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "P-OFF-04",
        userId: "seller-1",
        heading: "買家立即購買",
        path: "/profile/user/orderDetail/order-9",
      }),
    );
  });

  it("P-OFF-01 uses merchant trading path for merchant sellers", async () => {
    mockListingLookup("merchant");
    mockProfileLookup("Ash");

    await sendOfferReceivedPush({
      listingId: "listing-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      offerPrice: 1200,
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/profile/merchant/trading",
      }),
    );
  });

  it("P-OFF-04 uses merchant order detail path for merchant sellers", async () => {
    mockListingLookup("merchant");
    mockProfileLookup("Ash");

    await sendBuyNowSellerPush({
      listingId: "listing-1",
      sellerId: "seller-1",
      buyerId: "buyer-1",
      orderId: "order-9",
      offerPrice: 1500,
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/profile/merchant/orderDetail/order-9",
      }),
    );
  });

  it("P-OFF-03 resolves merchant seller display name", async () => {
    mockListingLookup("merchant");
    mockMerchantShopLookup("Vault Shop");

    await sendOfferRejectedPush({
      buyerId: "buyer-1",
      listingId: "listing-1",
      sellerId: "seller-1",
      offerPrice: 1200,
    });

    expect(sendPushToUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Vault Shop"),
      }),
    );
  });

  it("skips send when listing lookup fails", async () => {
    mockListingLookupMissing();

    await sendOfferReceivedPush({
      listingId: "listing-missing",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      offerPrice: 1200,
    });

    expect(sendPushToUserMock).not.toHaveBeenCalled();
  });

  it("skips send when offer lookup fails", async () => {
    mockOfferLookupMissing();

    await sendOfferAcceptedPush({
      offerId: "offer-missing",
      orderId: "order-1",
    });

    expect(sendPushToUserMock).not.toHaveBeenCalled();
  });
});
