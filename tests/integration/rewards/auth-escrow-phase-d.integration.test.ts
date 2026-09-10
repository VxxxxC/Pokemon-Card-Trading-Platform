import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import {
  ensureMerchantListingAcceptsAuthentication,
  findMerchantListingForIntegration,
  getMerchantOrderAuthEscrowRow,
  type MerchantOrderAuthEscrowRow,
  getMerchantOrderCouponRow,
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
  invokeAuthPreparePayment,
  invokeListCheckoutEligibleCoupons,
  markCouponUsedForOrder,
  restoreMerchantOrderCouponOnVoid,
  seedPendingMerchantOrders,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import { getTemplateIdByTitle } from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAuthFreeShippingInput,
  buildAutoGrantDiscountInput,
  buildDirectOnlyDiscountInput,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

function itemSubtotal(row: MerchantOrderAuthEscrowRow): number {
  return Number(row.item_subtotal ?? row.final_price ?? 0);
}

function expectAuthEscrowV2Snapshot(
  row: MerchantOrderAuthEscrowRow,
  options?: { expectFreeShippingSubsidy?: boolean },
): void {
  expect(row.escrow_capture_model).toBe("single");
  expect(row.requires_authentication).toBe(true);
  expect(Number(row.shipping_fee)).toBe(0);

  const inbound = Number(row.inbound_shipping_fee);
  const outbound = Number(row.outbound_shipping_fee);
  expect(inbound).toBeGreaterThan(0);
  expect(outbound).toBeGreaterThan(0);

  const item = itemSubtotal(row);
  const auth = Number(row.auth_fee);
  const total = Number(row.total_amount);
  const subsidy = Number(row.platform_subsidy_amount);
  const buyer = Number(row.buyer_total_amount);

  expect(total).toBe(item + auth + inbound + outbound);
  expect(buyer).toBe(total - subsidy);
  expect(buyer).toBeGreaterThan(0);

  if (options?.expectFreeShippingSubsidy) {
    expect(subsidy).toBeGreaterThan(0);
    expect(subsidy).toBeLessThanOrEqual(outbound);
  }
}

async function assertCouponReleased(params: {
  couponId: string;
  orderId: string;
}): Promise<void> {
  const rewardRow = await getUserRewardCheckoutRow(params.couponId);
  expect(rewardRow?.is_used).toBe(false);
  expect(rewardRow?.used_at).toBeNull();
  expect(rewardRow?.reserved_merchant_order_id).toBeNull();

  const orderRow = await getMerchantOrderCouponRow(params.orderId);
  expect(orderRow?.coupon_user_reward_id).toBeNull();
}

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Auth Escrow Phase D integration",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
      templateIds: [] as string[],
    };

    let listingId = "";
    let discountTemplateId = "";
    let freeShippingTemplateId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const listing = await findMerchantListingForIntegration();
      listingId = listing.listingId;
      await ensureMerchantListingAcceptsAuthentication(listingId);

      const discountTitle = uniqueTitle("AuthEscrowD Discount", runId);
      const freeShipTitle = uniqueTitle("AuthEscrowD FreeShip", runId);

      await runAsAdmin(async () => {
        await publishActivity(buildAutoGrantDiscountInput(discountTitle));
        await publishActivity(buildAuthFreeShippingInput(freeShipTitle));
      });

      const resolvedDiscountId = await getTemplateIdByTitle(discountTitle);
      const resolvedFreeShipId = await getTemplateIdByTitle(freeShipTitle);

      if (!resolvedDiscountId || !resolvedFreeShipId) {
        throw new Error("Auth Escrow Phase D coupon templates not found after publish");
      }

      discountTemplateId = resolvedDiscountId;
      freeShippingTemplateId = resolvedFreeShipId;
      tracked.templateIds.push(resolvedDiscountId, resolvedFreeShipId);
    });

    afterEach(async () => {
      await wipeCouponFsmRun({
        orderIds: [...tracked.orderIds],
        userRewardIds: [...tracked.userRewardIds],
      });
      tracked.orderIds = [];
      tracked.userRewardIds = [];
    });

    afterAll(async () => {
      await clearSessionCache();
    });

    it("I-D1: auth discount coupon prepare writes v2 four-line snapshot", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: discountTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const row = await getMerchantOrderAuthEscrowRow(orderId);
      expect(row).toBeTruthy();
      expectAuthEscrowV2Snapshot(row!);
      expect(Number(row!.platform_subsidy_amount)).toBeGreaterThan(0);
      expect(row!.coupon_user_reward_id).toBe(couponId);
      expect(row!.coupon_type).toBe("discount_coupon");
    });

    it("I-D2: auth free-shipping coupon subsidies outbound leg only", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: freeShippingTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const row = await getMerchantOrderAuthEscrowRow(orderId);
      expect(row).toBeTruthy();
      expectAuthEscrowV2Snapshot(row!, { expectFreeShippingSubsidy: true });
      expect(row!.coupon_type).toBe("free_shipping");
    });

    it("I-D3: grading fail void restores coupon after auth v2 prepare", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: discountTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const row = await getMerchantOrderAuthEscrowRow(orderId);
      expect(row).toBeTruthy();
      expectAuthEscrowV2Snapshot(row!);

      await markCouponUsedForOrder({ userRewardId: couponId, orderId });
      const usedRow = await getUserRewardCheckoutRow(couponId);
      expect(usedRow?.is_used).toBe(true);

      await restoreMerchantOrderCouponOnVoid(orderId);
      await assertCouponReleased({ couponId, orderId });

      const rePrepare = await invokeAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(rePrepare.success).toBe(true);
    });

    it("I-D4: direct-only coupon ineligible when useAuth=true", async () => {
      const directOnlyTitle = uniqueTitle("I-D4 DirectOnly", runId);

      await runAsAdmin(async () => {
        await publishActivity(buildDirectOnlyDiscountInput(directOnlyTitle));
      });

      const directOnlyTemplateId = await getTemplateIdByTitle(directOnlyTitle);
      expect(directOnlyTemplateId).toBeTruthy();
      tracked.templateIds.push(directOnlyTemplateId!);

      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMerchantOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: directOnlyTemplateId!,
      });
      tracked.userRewardIds.push(couponId);

      const buyerClient = getBuyerClient();
      const directList = await invokeListCheckoutEligibleCoupons(
        buyerClient,
        orderId,
        { useAuth: false },
      );
      const directRow = directList.find((row) => row.id === couponId);
      expect(directRow?.eligible).toBe(true);

      const authList = await invokeListCheckoutEligibleCoupons(
        buyerClient,
        orderId,
        { useAuth: true },
      );
      const authRow = authList.find((row) => row.id === couponId);
      expect(authRow?.eligible).toBe(false);
      expect(authRow?.ineligibleReason).toMatch(/鑑定/);

      const prepared = await invokeAuthPreparePayment(
        buyerClient,
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(false);
      if (!prepared.success) {
        expect(prepared.error).toMatch(/鑑定/);
      }
    });
  },
);
