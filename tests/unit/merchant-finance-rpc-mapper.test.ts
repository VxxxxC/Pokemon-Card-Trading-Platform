import { describe, expect, it } from "vitest";
import {
  mapMerchantFinanceSettlementsRpcPayload,
  MerchantFinanceSettlementsRpcSchema,
} from "@/lib/merchant-finance/map-merchant-finance-settlements";

describe("merchant finance settlements RPC mapper", () => {
  it("parses paginated RPC payload", () => {
    const payload = {
      monthEarned: 1200,
      total: 25,
      page: 2,
      pageSize: 10,
      totalPages: 3,
      rows: [
        {
          orderId: "00000000-0000-4000-8000-000000000001",
          orderNumber: "M-1001",
          cardName: "皮卡丘",
          amount: 500,
          commissionAmount: 50,
          paidAt: "2026-08-01T10:00:00.000Z",
          payoutStatus: "paid",
          payoutHoldUntil: null,
          stripeTransferId: "tr_test",
          stripePaymentIntentId: "pi_test",
          payoutError: null,
        },
      ],
    };

    expect(MerchantFinanceSettlementsRpcSchema.safeParse(payload).success).toBe(
      true,
    );
    expect(mapMerchantFinanceSettlementsRpcPayload(payload)?.page).toBe(2);
  });

  it("rejects malformed payload", () => {
    expect(mapMerchantFinanceSettlementsRpcPayload({ total: "bad" })).toBeNull();
  });
});
