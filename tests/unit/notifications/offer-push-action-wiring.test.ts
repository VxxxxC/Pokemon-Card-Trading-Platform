import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({
  sendOfferReceivedPush: vi.fn(),
  sendOfferAcceptedPush: vi.fn(),
  sendOfferRejectedPush: vi.fn(),
  sendBuyNowSellerPush: vi.fn(),
}));

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/notifications/offer-push", () => ({
  sendOfferReceivedPush: pushMocks.sendOfferReceivedPush,
  sendOfferAcceptedPush: pushMocks.sendOfferAcceptedPush,
  sendOfferRejectedPush: pushMocks.sendOfferRejectedPush,
  sendBuyNowSellerPush: pushMocks.sendBuyNowSellerPush,
}));

vi.mock("@/lib/notifications/offer-emails", () => ({
  enqueueOfferReceivedEmail: vi.fn().mockResolvedValue(undefined),
  enqueueOfferAcceptedEmail: vi.fn().mockResolvedValue(undefined),
  enqueueOfferRejectedEmail: vi.fn().mockResolvedValue(undefined),
  enqueueOfferExpiredEmailsForListing: vi.fn().mockResolvedValue(undefined),
  enqueueBuyNowSellerEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/p2p-order-emails", () => ({
  enqueueP2pMeetupArrangedEmails: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/grading-emails", () => ({
  enqueueB2cAwaitingPaymentBuyerEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/app/actions/profile", () => ({
  getCurrentUserProfile: vi.fn().mockResolvedValue({
    success: true,
    data: { displayName: "Buyer", username: "buyer" },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/home/revalidate-home-listings", () => ({
  revalidateHomeListingsCache: vi.fn(),
}));

import {
  acceptOffer,
  makeOffer,
  rejectOffer,
} from "@/app/actions/offers";
import { buyNowListing } from "@/app/actions/buy-now";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const OFFER_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const BUYER_ID = "44444444-4444-4444-8444-444444444444";
const SELLER_ID = "55555555-5555-4555-8555-555555555555";

function buildAuthClient(input: {
  userId: string;
  listing?: Record<string, unknown> | null;
  listingError?: string | null;
  rpc: ReturnType<typeof vi.fn>;
  extraFrom?: (table: string) => Record<string, unknown>;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: input.listing ?? null,
    error: input.listingError ? { message: input.listingError } : null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn((table: string) => {
    if (input.extraFrom) {
      const extra = input.extraFrom(table);
      if (extra) return extra;
    }
    return { select };
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: input.userId } },
        error: null,
      }),
    },
    from,
    rpc: input.rpc,
  };
}

describe("offer push action wiring (PR4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(pushMocks)) {
      mock.mockResolvedValue(undefined);
    }
  });

  it("makeOffer calls sendOfferReceivedPush after rpc_make_offer success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: "room-1" },
        offer: { id: OFFER_ID },
        message: { id: "msg-1" },
      },
      error: null,
    });

    createClientMock.mockResolvedValue(
      buildAuthClient({
        userId: BUYER_ID,
        listing: { seller_id: SELLER_ID },
        rpc,
      }) as never,
    );

    const result = await makeOffer(LISTING_ID, 1200);

    expect(result.success).toBe(true);
    expect(pushMocks.sendOfferReceivedPush).toHaveBeenCalledWith({
      listingId: LISTING_ID,
      buyerId: BUYER_ID,
      sellerId: SELLER_ID,
      offerPrice: 1200,
    });
  });

  it("makeOffer skips sendOfferReceivedPush when rpc fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "rpc failed" },
    });

    createClientMock.mockResolvedValue(
      buildAuthClient({
        userId: BUYER_ID,
        listing: { seller_id: SELLER_ID },
        rpc,
      }) as never,
    );

    const result = await makeOffer(LISTING_ID, 1200);

    expect(result.success).toBe(false);
    expect(pushMocks.sendOfferReceivedPush).not.toHaveBeenCalled();
  });

  it("acceptOffer calls sendOfferAcceptedPush after rpc_accept_offer success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_kind: "member",
        order: {
          id: ORDER_ID,
          listing_id: LISTING_ID,
          buyer_id: BUYER_ID,
          seller_id: SELLER_ID,
          use_authentication: true,
        },
        message_id: "msg-accept",
      },
      error: null,
    });

    createClientMock.mockResolvedValue(
      buildAuthClient({
        userId: SELLER_ID,
        rpc,
      }) as never,
    );

    const result = await acceptOffer(OFFER_ID);

    expect(result.success).toBe(true);
    expect(pushMocks.sendOfferAcceptedPush).toHaveBeenCalledWith({
      offerId: OFFER_ID,
      orderId: ORDER_ID,
    });
  });

  it("rejectOffer calls sendOfferRejectedPush after rpc_reject_offer success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        offer: {
          id: OFFER_ID,
          buyer_id: BUYER_ID,
          listing_id: LISTING_ID,
          offer_price: 1200,
        },
        message_id: "msg-reject",
      },
      error: null,
    });

    createClientMock.mockResolvedValue(
      buildAuthClient({
        userId: SELLER_ID,
        rpc,
      }) as never,
    );

    const result = await rejectOffer(OFFER_ID);

    expect(result.success).toBe(true);
    expect(pushMocks.sendOfferRejectedPush).toHaveBeenCalledWith({
      buyerId: BUYER_ID,
      listingId: LISTING_ID,
      sellerId: SELLER_ID,
      offerPrice: 1200,
    });
  });

  it("buyNowListing calls sendBuyNowSellerPush after rpc_buy_now_listing success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: "room-1" },
        offer: {
          id: OFFER_ID,
          offer_price: 1500,
          use_authentication: true,
        },
        offer_message: {
          id: "msg-buy",
          content: "buy now",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        accepted_message: null,
        order_kind: "member",
        order: {
          id: ORDER_ID,
          use_authentication: true,
          escrow_status: "payment",
        },
      },
      error: null,
    });

    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { display_name: "Seller", username: "seller" },
      error: null,
    });
    const profileEq = vi.fn().mockReturnValue({ maybeSingle: profileMaybeSingle });
    const profileSelect = vi.fn().mockReturnValue({ eq: profileEq });

    createClientMock.mockResolvedValue(
      buildAuthClient({
        userId: BUYER_ID,
        listing: {
          seller_id: SELLER_ID,
          seller_persona: "member",
          product_id: "prod-1",
          product_catalog: { name_zh: "皮卡丘", name_ja: "Pikachu" },
        },
        rpc,
        extraFrom: (table) => {
          if (table === "profiles") {
            return { select: profileSelect };
          }
          return null;
        },
      }) as never,
    );

    const result = await buyNowListing(LISTING_ID, false);

    expect(result.success).toBe(true);
    expect(pushMocks.sendBuyNowSellerPush).toHaveBeenCalledWith({
      listingId: LISTING_ID,
      sellerId: SELLER_ID,
      buyerId: BUYER_ID,
      orderId: ORDER_ID,
      offerPrice: 1500,
    });
  });
});
