import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.hoisted(() => vi.fn());
const enqueueConfirmMock = vi.hoisted(() => vi.fn());
const enqueueShipMock = vi.hoisted(() => vi.fn());
const enqueueConnectReminderMock = vi.hoisted(() => vi.fn());
const enqueueSanctionLiftedMock = vi.hoisted(() => vi.fn());
const enqueuePaymentExpiredMock = vi.hoisted(() => vi.fn());
const adminRpc = vi.hoisted(() => vi.fn());
const stripeRetrieve = vi.hoisted(() => vi.fn());
const stripeCancel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

vi.mock("@/lib/notifications/order-emails", () => ({
  enqueueOrderConfirmReminderBuyerEmail: enqueueConfirmMock,
  enqueueOrderShipReminderSellerEmail: enqueueShipMock,
  enqueueMerchantOrderPaymentExpiredEmails: enqueuePaymentExpiredMock,
}));

vi.mock("@/lib/notifications/merchant-onboarding-emails", () => ({
  enqueueMerchantConnectOnboardingReminderEmail: enqueueConnectReminderMock,
}));

vi.mock("@/lib/notifications/account-emails", () => ({
  enqueueAccountSanctionLiftedEmail: enqueueSanctionLiftedMock,
}));

function buildSelectChain<T>(rows: T[]) {
  const terminal = vi.fn().mockResolvedValue({ data: rows, error: null });
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "select",
    "eq",
    "is",
    "not",
    "lt",
    "lte",
    "gte",
    "neq",
    "or",
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.limit = terminal;
  return chain;
}

import { processConnectOnboardingReminders } from "@/lib/notifications/process-connect-onboarding-reminders";
import { processOrderFulfillmentReminders } from "@/lib/notifications/process-order-fulfillment-reminders";
import { processSanctionExpiryNotifications } from "@/lib/notifications/process-sanction-expiry-notifications";

describe("email cron producers enqueue wiring", () => {
  beforeEach(() => {
    fromMock.mockReset();
    enqueueConfirmMock.mockReset();
    enqueueShipMock.mockReset();
    enqueueConnectReminderMock.mockReset();
    enqueueSanctionLiftedMock.mockReset();
    enqueuePaymentExpiredMock.mockReset();
  });

  it("processOrderFulfillmentReminders enqueues E-ORD-07 for stale shipped merchant orders", async () => {
    const merchantQueues: unknown[][] = [
      [{ id: "m-order-1" }],
      [],
    ];
    fromMock.mockImplementation((table: string) => {
      if (table === "merchant_orders") {
        return buildSelectChain(
          (merchantQueues.shift() ?? []) as { id: string }[],
        );
      }
      return buildSelectChain([]);
    });

    const result = await processOrderFulfillmentReminders();

    expect(result.confirmReminders).toBe(1);
    expect(enqueueConfirmMock).toHaveBeenCalledWith({
      orderId: "m-order-1",
      orderKind: "merchant",
      idempotencyDateSuffix: expect.any(String),
    });
  });

  it("processOrderFulfillmentReminders enqueues E-ORD-08 for stale paid merchant orders", async () => {
    const merchantQueues: unknown[][] = [[], [{ id: "m-order-ship-1" }]];
    fromMock.mockImplementation((table: string) => {
      if (table === "merchant_orders") {
        return buildSelectChain(
          (merchantQueues.shift() ?? []) as { id: string }[],
        );
      }
      return buildSelectChain([]);
    });

    const result = await processOrderFulfillmentReminders();

    expect(result.shipReminders).toBe(1);
    expect(enqueueShipMock).toHaveBeenCalledWith({
      orderId: "m-order-ship-1",
      orderKind: "merchant",
      idempotencyDateSuffix: expect.any(String),
    });
  });

  it("processConnectOnboardingReminders enqueues E-MCH-04 for incomplete Connect", async () => {
    fromMock.mockImplementation(() =>
      buildSelectChain([
        {
          merchant_id: "merchant-1",
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          verified_at: "2020-01-01T00:00:00.000Z",
        },
      ]),
    );

    const result = await processConnectOnboardingReminders();

    expect(result.reminders).toBe(1);
    expect(enqueueConnectReminderMock).toHaveBeenCalledWith({
      userId: "merchant-1",
      idempotencyDateSuffix: expect.any(String),
    });
  });

  it("processSanctionExpiryNotifications enqueues E-ACC-08 for expired sanctions", async () => {
    fromMock.mockImplementation(() =>
      buildSelectChain([
        {
          id: "sanction-1",
          user_id: "user-1",
          type: "restrict_listing",
          ends_at: new Date().toISOString(),
        },
      ]),
    );

    const result = await processSanctionExpiryNotifications();

    expect(result.notifications).toBe(1);
    expect(enqueueSanctionLiftedMock).toHaveBeenCalledWith({
      userId: "user-1",
      sanctionId: "sanction-1",
      sanctionType: "restrict_listing",
    });
  });
});

describe("expire-merchant-pending-payment cron enqueue wiring", () => {
  beforeEach(() => {
    adminRpc.mockReset();
    stripeRetrieve.mockReset();
    stripeCancel.mockReset();
    enqueuePaymentExpiredMock.mockReset();
  });

  it("enqueues E-ORD-02 after successful expiry finalize", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({ rpc: adminRpc }),
    }));
    vi.doMock("@/lib/stripe/env", () => ({
      getStripeClient: async () => null,
    }));
    vi.doMock("@/lib/notifications/order-emails", () => ({
      enqueueMerchantOrderPaymentExpiredEmails: enqueuePaymentExpiredMock,
    }));

    adminRpc.mockImplementation((fn: string) => {
      if (fn === "rpc_list_merchant_pending_payment_expiry_candidates") {
        return Promise.resolve({
          data: [
            {
              order_id: "ord-expire-1",
              stripe_payment_intent_id: null,
              listing_id: "listing-1",
            },
          ],
          error: null,
        });
      }
      if (fn === "rpc_finalize_merchant_pending_payment_expiry") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    process.env.CRON_SECRET = "email_cron_enqueue_test_secret";

    const { GET } = await import(
      "@/app/api/cron/expire-merchant-pending-payment/route"
    );
    const response = await GET(
      new Request("http://127.0.0.1/api/cron/expire-merchant-pending-payment", {
        headers: { authorization: "Bearer email_cron_enqueue_test_secret" },
      }),
    );
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.expired).toBe(1);
    expect(enqueuePaymentExpiredMock).toHaveBeenCalledWith("ord-expire-1");
  });
});
