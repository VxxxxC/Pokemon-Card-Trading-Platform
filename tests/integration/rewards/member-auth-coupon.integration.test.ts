import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  backdateCouponReserve,
  ensureMemberListingAcceptsAuthentication,
  finalizeStaleCouponReserve,
  findMemberListingForIntegration,
  getMemberOrderAuthEscrowRow,
  getUserRewardCheckoutRow,
  grantCouponForCheckout,
  invokeListCheckoutEligibleCoupons,
  invokeMemberAuthPreparePayment,
  invokeReleaseMemberCoupon,
  restoreMemberOrderCouponOnVoid,
  seedPendingMemberAuthOrders,
} from "./helpers/checkout-fixture";
import { wipeCouponFsmRun } from "./helpers/cleanup";
import { getTemplateIdByTitle } from "./helpers/db-assert";
import { hasRewardsIntegrationEnv } from "./helpers/env";
import {
  buildAutoGrantDiscountInput,
  buildDirectOnlyDiscountInput,
  buildMemberAuthFreeShippingInput,
  uniqueTitle,
} from "./helpers/fixtures";
import { publishActivity } from "./helpers/publish";

type MemberAuthEscrowRow = NonNullable<
  Awaited<ReturnType<typeof getMemberOrderAuthEscrowRow>>
>;

function expectMemberAuthEscrowSnapshot(
  row: MemberAuthEscrowRow,
  options?: { expectFreeShippingSubsidy?: boolean },
): void {
  expect(row.escrow_capture_model).toBe("single");

  const inbound = Number(row.inbound_shipping_fee);
  const outbound = Number(row.outbound_shipping_fee);
  expect(inbound).toBeGreaterThan(0);
  expect(outbound).toBeGreaterThan(0);

  const item = Number(row.item_subtotal ?? row.final_price ?? 0);
  const auth = Number(row.auth_fee);
  const total = Number(row.total_amount);
  const subsidy = Number(row.platform_subsidy_amount);
  const buyer = Number(row.buyer_total_amount);

  expect(total).toBe(item + auth + inbound + outbound);
  expect(buyer).toBe(total - subsidy);
  expect(buyer).toBeGreaterThan(0);
  expect(Number(row.final_price)).toBe(item);

  if (options?.expectFreeShippingSubsidy) {
    expect(subsidy).toBeGreaterThan(0);
    expect(subsidy).toBeLessThanOrEqual(outbound);
  }
}

describe.skipIf(!hasRewardsIntegrationEnv()).sequential(
  "Member auth coupon integration",
  () => {
    const runId = String(Date.now());
    const tracked = {
      orderIds: [] as string[],
      userRewardIds: [] as string[],
      templateIds: [] as string[],
    };

    let listingId = "";
    let sellerId = "";
    let listingPrice = 0;
    let freeShippingTemplateId = "";
    let discountTemplateId = "";

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");

      const listing = await findMemberListingForIntegration();
      listingId = listing.listingId;
      sellerId = listing.sellerId;
      listingPrice = listing.price;
      await ensureMemberListingAcceptsAuthentication(listingId);

      const freeShipTitle = uniqueTitle("MemberAuthF FreeShip", runId);
      const discountTitle = uniqueTitle("MemberAuthF Discount", runId);

      await runAsAdmin(async () => {
        await publishActivity(buildMemberAuthFreeShippingInput(freeShipTitle));
        await publishActivity(buildAutoGrantDiscountInput(discountTitle));
      });

      const resolvedFreeShipId = await getTemplateIdByTitle(freeShipTitle);
      const resolvedDiscountId = await getTemplateIdByTitle(discountTitle);

      if (!resolvedFreeShipId || !resolvedDiscountId) {
        throw new Error("Member auth coupon templates not found after publish");
      }

      freeShippingTemplateId = resolvedFreeShipId;
      discountTemplateId = resolvedDiscountId;
      tracked.templateIds.push(resolvedFreeShipId, resolvedDiscountId);
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

    it("I-F0: no-coupon prepare succeeds on fresh pending order", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
      );
      expect(prepared.success).toBe(true);

      const row = await getMemberOrderAuthEscrowRow(orderId);
      expect(row).toBeTruthy();
      expectMemberAuthEscrowSnapshot(row!);
      expect(row!.coupon_user_reward_id).toBeNull();
      expect(Number(row!.platform_subsidy_amount)).toBe(0);
    });

    it("I-F0b: re-prepare without coupon detaches prior free_shipping", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: freeShippingTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const withCoupon = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(withCoupon.success).toBe(true);

      const withSubsidy = await getMemberOrderAuthEscrowRow(orderId);
      expect(withSubsidy?.coupon_user_reward_id).toBe(couponId);
      expect(Number(withSubsidy?.platform_subsidy_amount)).toBeGreaterThan(0);

      const withoutCoupon = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
      );
      expect(withoutCoupon.success).toBe(true);

      const detached = await getMemberOrderAuthEscrowRow(orderId);
      expect(detached?.coupon_user_reward_id).toBeNull();
      expect(Number(detached?.platform_subsidy_amount)).toBe(0);
      expectMemberAuthEscrowSnapshot(detached!);
    });

    it("I-F1: member prepare + free_shipping writes outbound subsidy snapshot", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: freeShippingTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const row = await getMemberOrderAuthEscrowRow(orderId);
      expect(row).toBeTruthy();
      expectMemberAuthEscrowSnapshot(row!, { expectFreeShippingSubsidy: true });
      expect(row!.coupon_user_reward_id).toBe(couponId);
      expect(row!.coupon_type).toBe("free_shipping");
    });

    it("I-F2: member prepare rejects discount_coupon", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: discountTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(false);
      expect(prepared.error).toMatch(/discount|折扣|免運|free_shipping/i);
    });

    it("I-F3: member list marks direct-only coupon ineligible for auth", async () => {
      const directOnlyTitle = uniqueTitle("I-F3 DirectOnly", runId);

      await runAsAdmin(async () => {
        await publishActivity(buildDirectOnlyDiscountInput(directOnlyTitle));
      });

      const directOnlyTemplateId = await getTemplateIdByTitle(directOnlyTitle);
      if (!directOnlyTemplateId) {
        throw new Error("Direct-only template missing");
      }
      tracked.templateIds.push(directOnlyTemplateId);

      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: directOnlyTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const listed = await invokeListCheckoutEligibleCoupons(
        getBuyerClient(),
        orderId,
        { shippingMethod: "sf", useAuth: true },
      );
      const row = listed.find((coupon) => coupon.id === couponId);
      expect(row?.eligible).toBe(false);
    });

    it("I-F4: member authorize marks coupon used without changing final_price", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: freeShippingTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const before = await getMemberOrderAuthEscrowRow(orderId);
      expect(before?.final_price).toBe(listingPrice);

      const admin = createServiceRoleClient();
      const { error } = await admin.rpc("rpc_mark_member_auth_order_authorized", {
        p_order_id: orderId,
        p_payment_intent_id: `pi_vitest_member_${orderId.slice(0, 8)}`,
        p_amounts: {},
      });
      expect(error).toBeNull();

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(true);

      const after = await getMemberOrderAuthEscrowRow(orderId);
      expect(after?.final_price).toBe(listingPrice);
    });

    it("I-F5: member grading fail void restores coupon", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: freeShippingTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      const admin = createServiceRoleClient();
      const paymentIntentId = `pi_vitest_member_void_${orderId.slice(0, 8)}`;
      await admin.rpc("rpc_mark_member_auth_order_authorized", {
        p_order_id: orderId,
        p_payment_intent_id: paymentIntentId,
        p_amounts: {},
      });

      await restoreMemberOrderCouponOnVoid(orderId);

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.is_used).toBe(false);
      expect(rewardRow?.reserved_member_order_id).toBeNull();

      const orderRow = await getMemberOrderAuthEscrowRow(orderId);
      expect(orderRow?.coupon_user_reward_id).toBeNull();
    });

    it("I-F6: stale member reserve releases coupon", async () => {
      const buyerId = getBuyerUserId();
      const [orderId] = await seedPendingMemberAuthOrders(buyerId, listingId, 1);
      tracked.orderIds.push(orderId);

      const couponId = await grantCouponForCheckout({
        userId: buyerId,
        templateId: freeShippingTemplateId,
      });
      tracked.userRewardIds.push(couponId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
        couponId,
      );
      expect(prepared.success).toBe(true);

      await backdateCouponReserve(couponId, 16);
      await finalizeStaleCouponReserve(couponId);

      const rewardRow = await getUserRewardCheckoutRow(couponId);
      expect(rewardRow?.reserved_member_order_id).toBeNull();

      const orderRow = await getMemberOrderAuthEscrowRow(orderId);
      expect(orderRow?.coupon_user_reward_id).toBeNull();
      expect(Number(orderRow?.platform_subsidy_amount)).toBe(0);

      const released = await invokeReleaseMemberCoupon(orderId);
      expect(released.success).toBe(true);
    });
  },
);
