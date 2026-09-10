import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import {
  computeBuyerTotal,
  computeSubsidy,
  type CouponKind,
} from "@/lib/rewards/checkout-subsidy-math";
import {
  classifyCouponTab,
  isCouponExpiredSqlStyle,
} from "@/lib/rewards/coupon-expiry";
import { groupUserRewardCoupons } from "@/lib/rewards/mapUserRewardCoupon";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import {
  findMerchantListingForIntegration,
  grantCouponForCheckout,
  invokePreparePayment,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAutoGrantDiscountInput,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

const PBT_NUM_RUNS = Number(process.env.COUPON_PBT_NUM_RUNS ?? 1000);

const COUPON_TABS = ["redeemable", "redeemed", "expired"] as const;

const hkdAmountArb = fc.integer({ min: 0, max: 1_000_000 });

const couponKindArb: fc.Arbitrary<CouponKind> = fc.constantFrom(
  "discount_coupon",
  "free_shipping",
);

const BOUNDARY_TIMESTAMPS = [
  "1970-01-01T00:00:00.000Z",
  "2000-02-29T23:59:59.000+08:00",
  "2024-12-31T23:59:59.000+08:00",
  "2025-01-01T00:00:00.000+08:00",
  "2038-01-19T03:14:07.000Z",
  "9999-12-31T23:59:59.000+08:00",
] as const;

const boundaryTimestampArb = fc.oneof(
  ...BOUNDARY_TIMESTAMPS.map((value) => fc.constant(value)),
  fc.integer({ min: 0, max: 4_102_444_800 }).map((seconds) =>
    new Date(seconds * 1000).toISOString(),
  ),
  fc.constant(null),
  fc.constant(""),
  fc.constant("not-a-date"),
  fc.constant("2024-13-40T99:99:99.000Z"),
);

function makeCouponRow(expiryIso: string | null, isUsed: boolean) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    is_used: isUsed,
    calculated_expiry: expiryIso,
    used_at: null,
    template: null,
  };
}

describe.sequential("Coupon PBT (pure)", () => {
  describe("Coupon pure exact (mutation killers)", () => {
    it("computeSubsidy discount caps at item subtotal and floors negatives", () => {
      expect(
        computeSubsidy({
          kind: "discount_coupon",
          itemSubtotal: 100,
          shippingFee: 0,
          amountHkd: 15,
          maxSubsidyHkd: 0,
        }),
      ).toBe(15);
      expect(
        computeSubsidy({
          kind: "discount_coupon",
          itemSubtotal: 10,
          shippingFee: 0,
          amountHkd: 15,
          maxSubsidyHkd: 0,
        }),
      ).toBe(10);
      expect(
        computeSubsidy({
          kind: "discount_coupon",
          itemSubtotal: -5,
          shippingFee: 0,
          amountHkd: 15,
          maxSubsidyHkd: 0,
        }),
      ).toBe(0);
      expect(
        computeSubsidy({
          kind: "discount_coupon",
          itemSubtotal: 100,
          shippingFee: 0,
          amountHkd: -8,
          maxSubsidyHkd: 0,
        }),
      ).toBe(0);
    });

    it("computeSubsidy free_shipping caps at shipping fee and max subsidy", () => {
      expect(
        computeSubsidy({
          kind: "free_shipping",
          itemSubtotal: 100,
          shippingFee: 12,
          amountHkd: 0,
          maxSubsidyHkd: 20,
        }),
      ).toBe(12);
      expect(
        computeSubsidy({
          kind: "free_shipping",
          itemSubtotal: 100,
          shippingFee: 30,
          amountHkd: 0,
          maxSubsidyHkd: 20,
        }),
      ).toBe(20);
      expect(
        computeSubsidy({
          kind: "free_shipping",
          itemSubtotal: 100,
          shippingFee: -4,
          amountHkd: 0,
          maxSubsidyHkd: 20,
        }),
      ).toBe(0);
      expect(
        computeSubsidy({
          kind: "free_shipping",
          itemSubtotal: 100,
          shippingFee: 30,
          amountHkd: 0,
          maxSubsidyHkd: -3,
        }),
      ).toBe(0);
    });

    it("computeSubsidy kind branch selects different formulas", () => {
      const base = {
        itemSubtotal: 100,
        shippingFee: 30,
        amountHkd: 15,
        maxSubsidyHkd: 20,
      };
      expect(computeSubsidy({ kind: "discount_coupon", ...base })).toBe(15);
      expect(computeSubsidy({ kind: "free_shipping", ...base })).toBe(20);
    });

    it("computeBuyerTotal sums components and floors buyer total at zero", () => {
      expect(
        computeBuyerTotal({
          itemSubtotal: 10,
          shippingFee: 5,
          authFee: 2,
          subsidy: 7,
        }),
      ).toEqual({ total: 17, buyerTotal: 10 });

      expect(
        computeBuyerTotal({
          itemSubtotal: 10,
          shippingFee: 0,
          authFee: 0,
          subsidy: 50,
        }),
      ).toEqual({ total: 10, buyerTotal: 0 });
    });

    it("isCouponExpiredSqlStyle handles nullish, invalid, and comparison edges", () => {
      const now = new Date("2025-06-15T12:00:00.000+08:00");

      expect(isCouponExpiredSqlStyle(null, now)).toBe(false);
      expect(isCouponExpiredSqlStyle(undefined, now)).toBe(false);
      expect(isCouponExpiredSqlStyle("", now)).toBe(false);
      expect(isCouponExpiredSqlStyle("not-a-date", now)).toBe(false);

      expect(
        isCouponExpiredSqlStyle("2025-06-14T12:00:00.000+08:00", now),
      ).toBe(true);
      expect(
        isCouponExpiredSqlStyle("2025-06-15T12:00:00.000+08:00", now),
      ).toBe(false);
      expect(
        isCouponExpiredSqlStyle("2025-06-16T12:00:00.000+08:00", now),
      ).toBe(false);
    });

    it("classifyCouponTab returns redeemed, expired, or redeemable exactly", () => {
      const now = new Date("2025-06-15T12:00:00.000+08:00");
      const expiredExpiry = "2025-06-14T12:00:00.000+08:00";
      const futureExpiry = "2025-06-16T12:00:00.000+08:00";

      expect(
        classifyCouponTab(
          { is_used: true, calculated_expiry: expiredExpiry },
          now,
        ),
      ).toBe("redeemed");

      expect(
        classifyCouponTab(
          { is_used: false, calculated_expiry: expiredExpiry },
          now,
        ),
      ).toBe("expired");

      expect(
        classifyCouponTab(
          { is_used: false, calculated_expiry: futureExpiry },
          now,
        ),
      ).toBe("redeemable");

      expect(
        classifyCouponTab({ is_used: false, calculated_expiry: null }, now),
      ).toBe("redeemable");
    });
  });

  it("I-P1: subsidy bounds and buyer_total >= 0 for 1,000 random inputs", () => {
    fc.assert(
      fc.property(
        couponKindArb,
        hkdAmountArb,
        hkdAmountArb,
        hkdAmountArb,
        hkdAmountArb,
        hkdAmountArb,
        (kind, itemSubtotal, amountOrMax, shippingFee, authFee, minSpend) => {
          const effectiveItemSubtotal = Math.max(itemSubtotal, minSpend);
          const subsidy = computeSubsidy({
            kind,
            itemSubtotal: effectiveItemSubtotal,
            shippingFee,
            amountHkd: amountOrMax,
            maxSubsidyHkd: amountOrMax,
          });
          const { total, buyerTotal } = computeBuyerTotal({
            itemSubtotal: effectiveItemSubtotal,
            shippingFee,
            authFee,
            subsidy,
          });

          if (kind === "discount_coupon") {
            expect(subsidy).toBeLessThanOrEqual(effectiveItemSubtotal);
          } else {
            expect(subsidy).toBeLessThanOrEqual(shippingFee);
            expect(subsidy).toBeLessThanOrEqual(amountOrMax);
          }

          expect(buyerTotal).toBeGreaterThanOrEqual(0);
          expect(buyerTotal).toBeLessThanOrEqual(total);
          expect(Number.isFinite(subsidy)).toBe(true);
          expect(Number.isFinite(buyerTotal)).toBe(true);
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    );
  });

  it("I-P2: expiry classification never throws for 1,000 boundary timestamps", () => {
    fc.assert(
      fc.property(
        boundaryTimestampArb,
        boundaryTimestampArb,
        fc.boolean(),
        (expiryIso, nowIso, isUsed) => {
          const now = new Date(nowIso ?? Date.now());

          expect(() => {
            const tab = classifyCouponTab(
              {
                is_used: isUsed,
                calculated_expiry: expiryIso,
              },
              now,
            );
            expect(COUPON_TABS).toContain(tab);
          }).not.toThrow();

          expect(() => {
            const expired = isCouponExpiredSqlStyle(expiryIso, now);
            expect(typeof expired).toBe("boolean");

            if (
              expiryIso &&
              nowIso &&
              !Number.isNaN(new Date(expiryIso).getTime()) &&
              !Number.isNaN(now.getTime())
            ) {
              expect(expired).toBe(new Date(expiryIso) < now);
            }
          }).not.toThrow();

          expect(() => {
            const grouped = groupUserRewardCoupons([
              makeCouponRow(expiryIso, isUsed),
            ]);
            expect(grouped.redeemable.length + grouped.redeemed.length + grouped.expired.length).toBe(1);
          }).not.toThrow();
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    );
  });

  it("I-P2b: HKT end-of-day boundaries never throw", () => {
    const hktEndOfDayCases = [
      { expiry: "2024-12-31T23:59:59.000+08:00", now: "2025-01-01T00:00:00.000+08:00" },
      { expiry: "2000-02-29T23:59:59.000+08:00", now: "2000-03-01T00:00:00.000+08:00" },
      { expiry: "2024-02-29T23:59:59.999+08:00", now: "2024-03-01T00:00:00.000+08:00" },
    ] as const;

    for (const { expiry, now } of hktEndOfDayCases) {
      expect(() =>
        classifyCouponTab(
          { is_used: false, calculated_expiry: expiry },
          new Date(now),
        ),
      ).not.toThrow();
      expect(
        isCouponExpiredSqlStyle(expiry, new Date(now)),
      ).toBe(true);
    }
  });
});

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Coupon PBT DB smoke",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
    };
    let publishedTemplateId: string | null = null;

    afterAll(async () => {
      await wipeCouponFsmRun(tracked);
      clearSessionCache();
    });

    it("I-P1b: prepare payment keeps subsidy <= item subtotal and buyer_total >= 0", async () => {
      await warmSession("buyer");
      const buyer = getBuyerClient();
      const buyerId = getBuyerUserId();
      const listing = await findMerchantListingForIntegration();

      const title = uniqueTitle("PBT discount", runId);
      publishedTemplateId = await publishActivity(buildAutoGrantDiscountInput(title));

      const userRewardId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: publishedTemplateId,
        dedupKey: `vitest-pbt-${crypto.randomUUID()}`,
      });
      tracked.userRewardIds.push(userRewardId);

      const { createServiceRoleClient } = await import("../shared/supabase-admin");
      const admin = createServiceRoleClient();

      const { data: orderId, error: seedError } = await admin.rpc(
        "rpc_e2e_seed_merchant_pending_payment_order",
        {
          p_listing_id: listing.listingId,
          p_buyer_id: buyerId,
        },
      );

      if (seedError) {
        throw new Error(`[I-P1b] seed order failed: ${seedError.message}`);
      }

      if (!orderId) {
        throw new Error("[I-P1b] missing seeded order id");
      }

      tracked.orderIds.push(orderId);

      const prepare = await invokePreparePayment(buyer, orderId, userRewardId);
      if (!prepare.success) {
        throw new Error(`[I-P1b] prepare failed: ${prepare.error}`);
      }

      const { data: orderRow, error: orderError } = await admin
        .from("merchant_orders")
        .select(
          "final_price, shipping_fee, platform_subsidy_amount, buyer_total_amount",
        )
        .eq("id", orderId)
        .maybeSingle();

      if (orderError) {
        throw new Error(`[I-P1b] order lookup failed: ${orderError.message}`);
      }

      if (!orderRow) {
        throw new Error("[I-P1b] missing merchant order row");
      }

      const itemSubtotal = Number(orderRow.final_price ?? 0);
      const shippingFee = Number(orderRow.shipping_fee ?? 0);
      const subsidy = Number(orderRow.platform_subsidy_amount ?? 0);
      const buyerTotal = Number(orderRow.buyer_total_amount ?? 0);
      const amountHkd = 15;

      const expected = computeSubsidy({
        kind: "discount_coupon",
        itemSubtotal,
        shippingFee,
        amountHkd,
        maxSubsidyHkd: amountHkd,
      });

      expect(subsidy).toBe(expected);
      expect(subsidy).toBeLessThanOrEqual(itemSubtotal);
      expect(buyerTotal).toBeGreaterThanOrEqual(0);

      const { buyerTotal: recomputedBuyerTotal } = computeBuyerTotal({
        itemSubtotal,
        shippingFee,
        authFee: 0,
        subsidy,
      });
      expect(buyerTotal).toBe(recomputedBuyerTotal);
    });
  },
);
