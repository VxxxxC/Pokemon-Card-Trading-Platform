import { beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({
  sendOrderConfirmReminderBuyerPush: vi.fn(),
  sendOrderShipReminderSellerPush: vi.fn(),
}));

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/notifications/order-push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications/order-push")>();
  return {
    ...actual,
    sendOrderConfirmReminderBuyerPush:
      pushMocks.sendOrderConfirmReminderBuyerPush,
    sendOrderShipReminderSellerPush: pushMocks.sendOrderShipReminderSellerPush,
  };
});

vi.mock("@/lib/notifications/enqueue-email", () => ({
  enqueueTransactionalEmail: vi.fn().mockResolvedValue({
    success: true,
    data: { id: "outbox-1", duplicate: false },
  }),
}));

const resolveAuthUserEmailsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(new Map([["buyer-1", "buyer@test.com"]])),
);

vi.mock("@/lib/notifications/resolve-auth-user-email", () => ({
  resolveAuthUserEmails: resolveAuthUserEmailsMock,
}));

vi.mock("@/lib/auth/site-url", () => ({
  getSiteUrl: vi.fn().mockResolvedValue("https://cardvaulthk.com"),
}));

import {
  enqueueOrderConfirmReminderBuyerEmail,
  enqueueOrderShipReminderSellerEmail,
} from "@/lib/notifications/order-emails";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function mockOrderRow(kind: "merchant" | "member") {
  const maybeSingle = vi.fn().mockResolvedValue({
    data:
      kind === "merchant"
        ? {
            buyer_id: "buyer-1",
            merchant_id: "seller-1",
            listing_id: "listing-1",
            order_number: "ORD-1",
          }
        : {
            buyer_id: "buyer-1",
            seller_id: "seller-1",
            listing_id: "listing-1",
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

describe("order push reminder wiring (PR9a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReset();
    for (const mock of Object.values(pushMocks)) {
      mock.mockResolvedValue(undefined);
    }
  });

  it("enqueueOrderConfirmReminderBuyerEmail triggers P-ORD-06 push", async () => {
    mockOrderRow("merchant");
    mockListingRow();

    await enqueueOrderConfirmReminderBuyerEmail({
      orderId: ORDER_ID,
      orderKind: "merchant",
      idempotencyDateSuffix: "2026-09-03",
    });

    expect(pushMocks.sendOrderConfirmReminderBuyerPush).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      orderKind: "merchant",
    });
  });

  it("enqueueOrderShipReminderSellerEmail triggers P-ORD-07 push", async () => {
    resolveAuthUserEmailsMock.mockResolvedValueOnce(
      new Map([["seller-1", "seller@test.com"]]),
    );
    mockOrderRow("member");
    mockListingRow();

    await enqueueOrderShipReminderSellerEmail({
      orderId: ORDER_ID,
      orderKind: "member",
      idempotencyDateSuffix: "2026-09-03",
    });

    expect(pushMocks.sendOrderShipReminderSellerPush).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      orderKind: "member",
    });
  });
});
