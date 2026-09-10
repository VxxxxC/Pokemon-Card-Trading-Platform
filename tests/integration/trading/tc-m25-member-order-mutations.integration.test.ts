import { afterAll, describe, expect, it } from "vitest";
import {
  cancelMemberOrder,
  completeMemberOrder,
} from "@/app/actions/orders";
import { INVALID_MEMBER_ORDER_ID_ERROR } from "@/lib/member-order/resolve-order-id";
import {
  clearSessionCache,
  runAsBuyer,
  runAsSeller,
  warmSession,
} from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasBaseIntegrationEnv } from "../shared/env";

const VALID_ORDER_UUID = "00000000-0000-4000-8000-000000000055";

describe("TC-M25 member order complete/cancel — contract", () => {
  it("completeMemberOrder rejects non-uuid order id", async () => {
    const result = await completeMemberOrder("ORD-2026-ABC123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(INVALID_MEMBER_ORDER_ID_ERROR);
    }
  });

  it("cancelMemberOrder rejects empty order id", async () => {
    const result = await cancelMemberOrder("  ");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("找不到此訂單");
    }
  });

  it("completeMemberOrder requires login", async () => {
    setGuestServerClient();

    const result = await completeMemberOrder(VALID_ORDER_UUID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });

  it("cancelMemberOrder requires login", async () => {
    setGuestServerClient();

    const result = await cancelMemberOrder(VALID_ORDER_UUID);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入");
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())(
  "TC-M25 member order complete/cancel — smoke",
  () => {
    afterAll(async () => {
      await clearSessionCache();
    });

    it("buyer completeMemberOrder on unknown order fails safely", async () => {
      await warmSession("buyer");

      const result = await runAsBuyer(async () =>
        completeMemberOrder(VALID_ORDER_UUID),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("找不到指定的交易訂單記錄");
      }
    });

    it("seller cancelMemberOrder on unknown order fails safely", async () => {
      await warmSession("seller");

      const result = await runAsSeller(async () =>
        cancelMemberOrder(VALID_ORDER_UUID),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  },
);
