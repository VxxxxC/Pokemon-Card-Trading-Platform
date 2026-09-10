import { afterAll, describe, expect, it } from "vitest";
import {
  getPublicProfileReviews,
  submitTransactionReview,
} from "@/app/actions/reviews";
import {
  clearSessionCache,
  getSellerUserId,
  runAsBuyer,
  runAsSeller,
  warmSession,
} from "../shared/auth-context";
import { setGuestServerClient } from "../shared/guest-auth";
import { hasBaseIntegrationEnv } from "../shared/env";

const REVIEWEE_UUID = "00000000-0000-4000-8000-000000000088";
const ORDER_UUID = "00000000-0000-4000-8000-000000000077";

describe("TC-M22 reviews — contract", () => {
  it("submitTransactionReview rejects invalid rating", async () => {
    const result = await submitTransactionReview({
      orderId: ORDER_UUID,
      revieweeId: REVIEWEE_UUID,
      rating: 0,
      comment: "ok",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請選擇 1 至 5 星評分");
    }
  });

  it("submitTransactionReview rejects overlong comment", async () => {
    const result = await submitTransactionReview({
      orderId: ORDER_UUID,
      revieweeId: REVIEWEE_UUID,
      rating: 5,
      comment: "x".repeat(201),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("留言不可超過");
    }
  });

  it("submitTransactionReview requires login", async () => {
    setGuestServerClient();

    const result = await submitTransactionReview({
      orderId: ORDER_UUID,
      revieweeId: REVIEWEE_UUID,
      rating: 5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("請先登入後再提交評價");
    }
  });

  it("getPublicProfileReviews rejects empty profile id", async () => {
    const result = await getPublicProfileReviews({ profileId: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.notFound).toBe(true);
    }
  });
});

describe.skipIf(!hasBaseIntegrationEnv())("TC-M22 reviews — smoke", () => {
  afterAll(async () => {
    await clearSessionCache();
  });

  it("public profile reviews load for seller fixture", async () => {
    await warmSession("seller");
    const sellerId = getSellerUserId();

    const result = await runAsSeller(async () =>
      getPublicProfileReviews({
        profileId: sellerId,
        persona: "member",
        page: 1,
        pageSize: 5,
      }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.reviews)).toBe(true);
    }
  });

  it("buyer submitTransactionReview on unknown order returns RPC error", async () => {
    await warmSession("buyer");
    await warmSession("seller");

    const result = await runAsBuyer(async () =>
      submitTransactionReview({
        orderId: ORDER_UUID,
        revieweeId: getSellerUserId(),
        rating: 5,
        comment: "integration smoke",
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
