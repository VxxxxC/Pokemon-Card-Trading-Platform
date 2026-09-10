import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const CRON_SECRET = "cron_route_integration_test_secret";
const AUTH_HEADERS = { authorization: `Bearer ${CRON_SECRET}` };

const adminRpc = vi.hoisted(() => vi.fn());
const stripeRetrieve = vi.hoisted(() => vi.fn());
const stripeCancel = vi.hoisted(() => vi.fn());
const executeConnectPayout = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

function buildEmptyFromChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const terminal = vi.fn().mockResolvedValue({ data: [], error: null });
  for (const method of [
    "select",
    "eq",
    "gte",
    "not",
    "gt",
    "order",
    "in",
    "insert",
    "upsert",
  ]) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.range = terminal;
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: adminRpc,
    from: fromMock,
  }),
}));

vi.mock("@/lib/stripe/env", () => ({
  getStripeClient: async () => ({
    paymentIntents: {
      retrieve: stripeRetrieve,
      cancel: stripeCancel,
    },
  }),
}));

vi.mock("@/lib/merchant-order/execute-connect-payout", () => ({
  executeMerchantConnectPayout: executeConnectPayout,
}));

import { GET as getExpireMerchantPendingPayment } from "@/app/api/cron/expire-merchant-pending-payment/route";
import { GET as getReleaseStaleCouponReserves } from "@/app/api/cron/release-stale-coupon-reserves/route";
import { GET as getMemberFpsPayoutReady } from "@/app/api/cron/member-fps-payout-ready/route";
import { GET as getMerchantConnectPayoutReady } from "@/app/api/cron/merchant-connect-payout-ready/route";
import { GET as getIngestPlatformTrades } from "@/app/api/cron/ingest-platform-trades/route";
import { GET as getAggregatePrices } from "@/app/api/cron/aggregate-prices/route";
import { GET as getProcessEmailOutbox } from "@/app/api/cron/process-email-outbox/route";

type CronCase = {
  id: string;
  path: string;
  handler: (request: Request) => Promise<Response>;
  setup?: () => void;
  assertBody: (body: Record<string, unknown>) => void;
};

const CRON_CASES: CronCase[] = [
  {
    id: "TC-M01",
    path: "/api/cron/expire-merchant-pending-payment",
    handler: getExpireMerchantPendingPayment,
    setup: () => {
      adminRpc.mockImplementation((fn: string) => {
        if (fn === "rpc_list_merchant_pending_payment_expiry_candidates") {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.scanned).toBe(0);
      expect(body.expired).toBe(0);
    },
  },
  {
    id: "TC-M02",
    path: "/api/cron/release-stale-coupon-reserves",
    handler: getReleaseStaleCouponReserves,
    setup: () => {
      adminRpc.mockImplementation((fn: string) => {
        if (fn === "rpc_list_stale_coupon_reserve_candidates") {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.scanned).toBe(0);
      expect(body.released).toBe(0);
    },
  },
  {
    id: "TC-M03",
    path: "/api/cron/member-fps-payout-ready",
    handler: getMemberFpsPayoutReady,
    setup: () => {
      adminRpc.mockImplementation((fn: string) => {
        if (fn === "rpc_list_member_fps_payout_ready_candidates") {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.scanned).toBe(0);
      expect(body.inserted).toBe(0);
    },
  },
  {
    id: "TC-M04",
    path: "/api/cron/merchant-connect-payout-ready",
    handler: getMerchantConnectPayoutReady,
    setup: () => {
      adminRpc.mockImplementation((fn: string) => {
        if (fn === "rpc_list_merchant_connect_payout_candidates") {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      executeConnectPayout.mockReset();
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.scanned).toBe(0);
      expect(body.transferred).toBe(0);
    },
  },
  {
    id: "TC-M05",
    path: "/api/cron/ingest-platform-trades",
    handler: getIngestPlatformTrades,
    setup: () => {
      fromMock.mockImplementation(() => buildEmptyFromChain());
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        ordersScanned: 0,
        snapshotsInserted: 0,
      });
    },
  },
  {
    id: "TC-M06",
    path: "/api/cron/aggregate-prices",
    handler: getAggregatePrices,
    setup: () => {
      fromMock.mockImplementation(() => buildEmptyFromChain());
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        productsProcessed: 0,
        rowsUpserted: 0,
      });
    },
  },
  {
    id: "TC-M07",
    path: "/api/cron/process-email-outbox",
    handler: getProcessEmailOutbox,
    setup: () => {
      const limit = vi.fn().mockResolvedValue({ data: [], error: null });
      const order = vi.fn().mockReturnValue({ limit });
      const lte = vi.fn().mockReturnValue({ order });
      const inFn = vi.fn().mockReturnValue({ lte });
      const select = vi.fn().mockReturnValue({ in: inFn });
      fromMock.mockReturnValue({ select });
    },
    assertBody: (body) => {
      expect(body.success).toBe(true);
      expect(body.scanned).toBe(0);
    },
  },
];

describe("cron HTTP routes (TC-M01–M07)", () => {
  beforeAll(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.RESEND_API_KEY =
      process.env.RESEND_API_KEY ?? "re_cron_route_integration_test";
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-test-key";
  });

  beforeEach(() => {
    adminRpc.mockReset();
    stripeRetrieve.mockReset();
    stripeCancel.mockReset();
    executeConnectPayout.mockReset();
    fromMock.mockReset();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  it("rejects requests without Bearer CRON_SECRET", async () => {
    const response = await getReleaseStaleCouponReserves(
      new Request("http://localhost/api/cron/release-stale-coupon-reserves"),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 500 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const response = await getReleaseStaleCouponReserves(
      new Request("http://localhost/api/cron/release-stale-coupon-reserves", {
        headers: AUTH_HEADERS,
      }),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { success: boolean; error: string };
    expect(body.error).toContain("CRON_SECRET");
  });

  for (const cronCase of CRON_CASES) {
    it(`${cronCase.id}: ${cronCase.path} authorized empty-batch success`, async () => {
      cronCase.setup?.();
      const response = await cronCase.handler(
        new Request(`http://localhost${cronCase.path}`, {
          headers: AUTH_HEADERS,
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      cronCase.assertBody(body);
    });
  }
});
