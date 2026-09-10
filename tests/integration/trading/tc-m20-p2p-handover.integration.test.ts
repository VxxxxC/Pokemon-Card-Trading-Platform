import { afterAll, describe, expect, it } from "vitest";
import {
  confirmBuyerReceived,
  getUserTradingOrders,
  searchUserTradingOrders,
} from "@/app/actions/orders";
import { resolveChatCompletionOrderId } from "@/app/actions/reviews";
import { INVALID_MEMBER_ORDER_ID_ERROR } from "@/lib/member-order/resolve-order-id";
import {
  clearSessionCache,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasBaseIntegrationEnv } from "../shared/env";

const VALID_ORDER_UUID = "00000000-0000-4000-8000-000000000099";

describe("TC-M20 P2P handover — contract", () => {
  it("confirmBuyerReceived requires login", async () => {
    setGuestServerClient();

    const result = await confirmBuyerReceived(VALID_ORDER_UUID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });

  it("resolveChatCompletionOrderId returns null order when ids missing", async () => {
    const result = await resolveChatCompletionOrderId({
      messageId: "",
      roomId: "",
      revieweeId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.orderId).toBeNull();
    }
  });

  it("searchUserTradingOrders handles guest session", async () => {
    setGuestServerClient();

    const result = await searchUserTradingOrders({
      tabStatus: "pending",
      page: 1,
      pageSize: 10,
    });

    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
    } else {
      expect(result.error).toBe("請登入以查閱訂單");
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())("TC-M20 P2P handover — smoke", () => {
  afterAll(async () => {
    await clearSessionCache();
  });

  it("buyer can load trading orders list", async () => {
    await warmSession("buyer");

    const result = await runAsBuyer(async () =>
      getUserTradingOrders({ tabStatus: "pending" }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  it("buyer confirmBuyerReceived on unknown uuid returns mapped error", async () => {
    await warmSession("buyer");

    const result = await runAsBuyer(async () =>
      confirmBuyerReceived(VALID_ORDER_UUID),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(INVALID_MEMBER_ORDER_ID_ERROR);
    }
  });
});
