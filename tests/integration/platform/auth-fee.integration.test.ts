import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureMemberListingAcceptsAuthentication,
  ensureMerchantListingAcceptsAuthentication,
  findMemberListingForIntegration,
  findMerchantListingForIntegration,
  invokeMemberAuthPreparePayment,
  seedPendingMemberAuthOrders,
} from "../rewards/helpers/checkout-fixture";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  AUTH_ESCROW_CONFIG_KEY,
  DEFAULT_AUTH_FEE_HKD,
  buildAuthEscrowConfigValue,
} from "@/lib/platform/auth-escrow-config";

async function setPlatformAuthFeeHkd(feeHkd: number): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", AUTH_ESCROW_CONFIG_KEY)
    .maybeSingle();

  const nextValue = buildAuthEscrowConfigValue(existing?.value, feeHkd);
  const { error } = await admin.from("platform_settings").upsert(
    {
      key: AUTH_ESCROW_CONFIG_KEY,
      value: nextValue,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(`[setPlatformAuthFeeHkd] ${error.message}`);
  }
}

async function readPlatformAuthFeeHkd(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("fn_platform_auth_fee_hkd");
  if (error) {
    throw new Error(`[readPlatformAuthFeeHkd] ${error.message}`);
  }
  return Number(data);
}

async function seedPendingMerchantOrder(
  buyerId: string,
  listingId: string,
): Promise<string> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc(
    "rpc_e2e_seed_merchant_pending_payment_order",
    {
      p_listing_id: listingId,
      p_buyer_id: buyerId,
    },
  );

  if (error || !data) {
    throw new Error(
      `[seedPendingMerchantOrder] ${error?.message ?? "missing order id"}`,
    );
  }

  return data;
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "Platform auth fee SSOT integration",
  () => {
    const createdMerchantOrderIds: string[] = [];
    const createdMemberOrderIds: string[] = [];
    let listingId = "";

    beforeAll(async () => {
      await warmSession("buyer");
      await setPlatformAuthFeeHkd(DEFAULT_AUTH_FEE_HKD);
      const listing = await findMerchantListingForIntegration();
      listingId = listing.listingId;
      await ensureMerchantListingAcceptsAuthentication(listingId);
    });

    it("Case B: default auth fee RPC matches SSOT constant", async () => {
      expect(await readPlatformAuthFeeHkd()).toBe(DEFAULT_AUTH_FEE_HKD);
    });

    it("Case A/D: settings upsert updates SQL helpers", async () => {
      await setPlatformAuthFeeHkd(200);
      expect(await readPlatformAuthFeeHkd()).toBe(200);

      const admin = createServiceRoleClient();
      const { data: helperFee, error } = await admin.rpc(
        "fn_merchant_checkout_auth_fee",
        { p_use_auth: true },
      );
      expect(error).toBeNull();
      expect(Number(helperFee)).toBe(200);
    });

    it("Case E: merchant direct + auth prepare snapshots settings fee", async () => {
      await setPlatformAuthFeeHkd(200);
      const buyerId = getBuyerUserId();
      const orderId = await seedPendingMerchantOrder(buyerId, listingId);
      createdMerchantOrderIds.push(orderId);

      const { error: prepareError } = await getBuyerClient().rpc(
        "rpc_prepare_merchant_order_payment",
        {
          p_order_id: orderId,
          p_shipping_method: "meetup",
          p_use_auth: true,
          p_sf_locker_code: null,
          p_sf_address: null,
          p_buyer_phone: "91234567",
          p_meetup_detail: "Auth fee SSOT",
          p_buyer_remark: null,
          p_user_reward_id: null,
        },
      );
      expect(prepareError).toBeNull();

      const admin = createServiceRoleClient();
      const { data: order } = await admin
        .from("merchant_orders")
        .select("auth_fee, inbound_shipping_fee, outbound_shipping_fee")
        .eq("id", orderId)
        .maybeSingle();

      expect(Number(order?.auth_fee)).toBe(200);
      expect(Number(order?.inbound_shipping_fee)).toBeGreaterThan(0);
      expect(Number(order?.outbound_shipping_fee)).toBeGreaterThan(0);
    });

    it("Case C2: pending order re-prepare picks up new settings fee", async () => {
      const buyerId = getBuyerUserId();
      const orderId = await seedPendingMerchantOrder(buyerId, listingId);
      createdMerchantOrderIds.push(orderId);

      await setPlatformAuthFeeHkd(200);
      const firstPrepare = await getBuyerClient().rpc(
        "rpc_prepare_merchant_order_payment",
        {
          p_order_id: orderId,
          p_shipping_method: "meetup",
          p_use_auth: true,
          p_sf_locker_code: null,
          p_sf_address: null,
          p_buyer_phone: "91234567",
          p_meetup_detail: "Re-prepare A",
          p_buyer_remark: null,
          p_user_reward_id: null,
        },
      );
      expect(firstPrepare.error).toBeNull();

      await setPlatformAuthFeeHkd(180);
      const secondPrepare = await getBuyerClient().rpc(
        "rpc_prepare_merchant_order_payment",
        {
          p_order_id: orderId,
          p_shipping_method: "meetup",
          p_use_auth: true,
          p_sf_locker_code: null,
          p_sf_address: null,
          p_buyer_phone: "91234567",
          p_meetup_detail: "Re-prepare B",
          p_buyer_remark: null,
          p_user_reward_id: null,
        },
      );
      expect(secondPrepare.error).toBeNull();

      const admin = createServiceRoleClient();
      const { data: order } = await admin
        .from("merchant_orders")
        .select("auth_fee")
        .eq("id", orderId)
        .maybeSingle();

      expect(Number(order?.auth_fee)).toBe(180);
    });

    it("Case G: member auth prepare snapshots settings fee", async () => {
      await setPlatformAuthFeeHkd(200);
      const buyerId = getBuyerUserId();
      const admin = createServiceRoleClient();

      let memberListingId: string;
      try {
        const memberListing = await findMemberListingForIntegration({
          excludeBuyerId: buyerId,
        });
        memberListingId = memberListing.listingId;
        await ensureMemberListingAcceptsAuthentication(memberListingId);
      } catch {
        return;
      }

      const [orderId] = await seedPendingMemberAuthOrders(
        buyerId,
        memberListingId,
        1,
      );
      createdMemberOrderIds.push(orderId);

      const prepared = await invokeMemberAuthPreparePayment(
        getBuyerClient(),
        orderId,
      );
      expect(prepared.success).toBe(true);

      const { data: order } = await admin
        .from("member_orders")
        .select("auth_fee")
        .eq("id", orderId)
        .maybeSingle();

      expect(Number(order?.auth_fee)).toBe(200);
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      for (const orderId of createdMerchantOrderIds) {
        await admin.from("merchant_orders").delete().eq("id", orderId);
      }
      for (const orderId of createdMemberOrderIds) {
        await admin.from("member_orders").delete().eq("id", orderId);
      }
      await setPlatformAuthFeeHkd(DEFAULT_AUTH_FEE_HKD);
      await clearSessionCache();
    });
  },
);
