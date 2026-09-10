import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({
  sendMerchantOrderPaymentConfirmedSellerPush: vi.fn(),
  sendMemberOrderPaymentConfirmedSellerPush: vi.fn(),
  sendMerchantOrderShippedBuyerPush: vi.fn(),
  sendMerchantOrderPaymentExpiredBuyerPush: vi.fn(),
  sendOrderBuyerConfirmedSellerPush: vi.fn(),
  sendOrderCompletedBuyerPush: vi.fn(),
  sendOrderCompletedMerchantPush: vi.fn(),
  sendOrderReviewInvitePush: vi.fn(),
}));

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/notifications/order-push", () => ({
  sendMerchantOrderPaymentConfirmedSellerPush:
    pushMocks.sendMerchantOrderPaymentConfirmedSellerPush,
  sendMemberOrderPaymentConfirmedSellerPush:
    pushMocks.sendMemberOrderPaymentConfirmedSellerPush,
  sendMerchantOrderShippedBuyerPush: pushMocks.sendMerchantOrderShippedBuyerPush,
  sendMerchantOrderPaymentExpiredBuyerPush:
    pushMocks.sendMerchantOrderPaymentExpiredBuyerPush,
  sendOrderBuyerConfirmedSellerPush: pushMocks.sendOrderBuyerConfirmedSellerPush,
  sendOrderCompletedBuyerPush: pushMocks.sendOrderCompletedBuyerPush,
  sendOrderCompletedMerchantPush: pushMocks.sendOrderCompletedMerchantPush,
  sendOrderReviewInvitePush: pushMocks.sendOrderReviewInvitePush,
}));

vi.mock("@/lib/notifications/enqueue-email", () => ({
  enqueueTransactionalEmail: vi.fn().mockResolvedValue({
    success: true,
    data: { id: "outbox-1", duplicate: false },
  }),
}));

vi.mock("@/lib/notifications/resolve-auth-user-email", () => ({
  resolveAuthUserEmails: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/auth/site-url", () => ({
  getSiteUrl: vi.fn().mockResolvedValue("https://cardvaulthk.com"),
}));

import {
  enqueueMerchantOrderPaymentConfirmedEmails,
  enqueueMerchantOrderPaymentExpiredEmails,
  enqueueMerchantOrderShippedBuyerEmail,
  enqueueMemberOrderPaymentConfirmedEmails,
  enqueueMerchantOrderBuyerConfirmedSellerEmail,
  enqueueMemberOrderBuyerConfirmedSellerEmail,
  enqueueOrderCompletedBuyerEmail,
  enqueueB2cCompletedMerchantEmail,
} from "@/lib/notifications/order-emails";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function mockMerchantOrderRow() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: ORDER_ID,
      buyer_id: "buyer-1",
      merchant_id: "seller-1",
      listing_id: "listing-1",
      buyer_total_amount: 1200,
      total_amount: null,
      final_price: 1200,
      order_number: "ORD-1",
      outbound_tracking_no: "SF123",
      outbound_courier_name: "順豐",
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockMemberOrderRow() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: ORDER_ID,
      buyer_id: "buyer-1",
      seller_id: "seller-1",
      listing_id: "listing-1",
      buyer_total_amount: 800,
      total_amount: null,
      final_price: 800,
      order_number: "ORD-2",
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

function mockListingRow() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: "listing-1",
      seller_persona: "merchant",
      product_catalog: { name_zh: "皮卡丘", name_ja: "Pikachu" },
    },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  fromMock.mockReturnValueOnce({ select });
}

describe("order push action wiring (PR5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReset();
    for (const mock of Object.values(pushMocks)) {
      mock.mockResolvedValue(undefined);
    }
  });

  it("enqueueMerchantOrderPaymentConfirmedEmails triggers P-ORD-01 push", async () => {
    mockMerchantOrderRow();
    mockListingRow();

    await enqueueMerchantOrderPaymentConfirmedEmails(ORDER_ID);

    expect(pushMocks.sendMerchantOrderPaymentConfirmedSellerPush).toHaveBeenCalledWith(
      ORDER_ID,
    );
  });

  it("enqueueMemberOrderPaymentConfirmedEmails triggers P-ORD-01 push", async () => {
    mockMemberOrderRow();
    mockListingRow();

    await enqueueMemberOrderPaymentConfirmedEmails(ORDER_ID);

    expect(pushMocks.sendMemberOrderPaymentConfirmedSellerPush).toHaveBeenCalledWith(
      ORDER_ID,
    );
  });

  it("enqueueMerchantOrderShippedBuyerEmail triggers P-ORD-02 push", async () => {
    mockMerchantOrderRow();
    mockListingRow();

    await enqueueMerchantOrderShippedBuyerEmail(ORDER_ID, {
      trackingNo: "SF123",
      courierName: "順豐",
    });

    expect(pushMocks.sendMerchantOrderShippedBuyerPush).toHaveBeenCalledWith(
      ORDER_ID,
      { trackingNo: "SF123", courierName: "順豐" },
    );
  });

  it("enqueueMerchantOrderPaymentExpiredEmails triggers P-ORD-03 push", async () => {
    mockMerchantOrderRow();
    mockListingRow();

    await enqueueMerchantOrderPaymentExpiredEmails(ORDER_ID);

    expect(pushMocks.sendMerchantOrderPaymentExpiredBuyerPush).toHaveBeenCalledWith(
      ORDER_ID,
    );
  });

  it("enqueueMerchantOrderBuyerConfirmedSellerEmail triggers P-ORD-04 push", async () => {
    mockMerchantOrderRow();
    mockListingRow();

    await enqueueMerchantOrderBuyerConfirmedSellerEmail(ORDER_ID);

    expect(pushMocks.sendOrderBuyerConfirmedSellerPush).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      orderKind: "merchant",
    });
  });

  it("enqueueMemberOrderBuyerConfirmedSellerEmail triggers P-ORD-04 push", async () => {
    mockMemberOrderRow();
    mockListingRow();

    await enqueueMemberOrderBuyerConfirmedSellerEmail(ORDER_ID);

    expect(pushMocks.sendOrderBuyerConfirmedSellerPush).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      orderKind: "member",
    });
  });

  it("enqueueOrderCompletedBuyerEmail triggers P-ORD-05 buyer push", async () => {
    mockMerchantOrderRow();
    mockListingRow();

    await enqueueOrderCompletedBuyerEmail(ORDER_ID, "merchant");

    expect(pushMocks.sendOrderCompletedBuyerPush).toHaveBeenCalledWith(
      ORDER_ID,
      "merchant",
    );
  });

  it("enqueueB2cCompletedMerchantEmail triggers P-ORD-05 merchant push", async () => {
    mockMerchantOrderRow();
    mockListingRow();

    await enqueueB2cCompletedMerchantEmail(ORDER_ID);

    expect(pushMocks.sendOrderCompletedMerchantPush).toHaveBeenCalledWith(
      ORDER_ID,
    );
  });
});
