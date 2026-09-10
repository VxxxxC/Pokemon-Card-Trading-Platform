import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getPlatformFinancialConfig,
  updatePlatformFinancialConfig,
} from "@/app/actions/admin-settings";
import {
  AUTH_ESCROW_CONFIG_KEY,
  DEFAULT_AUTH_FEE_HKD,
} from "@/lib/platform/auth-escrow-config";
import {
  commissionRateToPercent,
  DEFAULT_COMMISSION_RATE,
  PLATFORM_FINANCIAL_CONFIG_KEY,
} from "@/lib/platform/financial-config";
import {
  ensureMerchantListingAcceptsAuthentication,
  findMerchantListingForIntegration,
} from "../rewards/helpers/checkout-fixture";
import { seedMerchantOrderReadyForBuyerConfirm } from "../merchant/helpers/merchant-order-fixture";
import {
  hasMerchantGradingEnvVars,
  merchantIt,
  warmMerchantGradingEnv,
} from "../grading/helpers/grading-merchant-env";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";

async function readPlatformAuthFeeHkd(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("fn_platform_auth_fee_hkd");
  if (error) {
    throw new Error(`[readPlatformAuthFeeHkd] ${error.message}`);
  }
  return Number(data);
}

async function readPlatformCommissionRate(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("fn_platform_commission_rate");
  if (error) {
    throw new Error(`[readPlatformCommissionRate] ${error.message}`);
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
  "Platform admin settings contract (CC-PLAT-01 / CC-PLAT-02)",
  () => {
    const runId = String(Date.now());
    const createdMerchantOrderIds: string[] = [];
    let listingId = "";
    const defaultCommissionPercent = commissionRateToPercent(DEFAULT_COMMISSION_RATE);

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      if (hasMerchantGradingEnvVars()) {
        await warmMerchantGradingEnv();
      }

      const listing = await findMerchantListingForIntegration();
      listingId = listing.listingId;
      await ensureMerchantListingAcceptsAuthentication(listingId);

      await runAsAdmin(async () => {
        const result = await updatePlatformFinancialConfig({
          commissionRatePercent: defaultCommissionPercent,
          appraisalFeeHkd: DEFAULT_AUTH_FEE_HKD,
        });
        expect(result.success).toBe(true);
      });
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      for (const orderId of createdMerchantOrderIds) {
        await admin.from("merchant_orders").delete().eq("id", orderId);
      }

      await runAsAdmin(async () => {
        await updatePlatformFinancialConfig({
          commissionRatePercent: defaultCommissionPercent,
          appraisalFeeHkd: DEFAULT_AUTH_FEE_HKD,
        });
      });

      await clearSessionCache();
    });

    it("CC-PLAT-01: admin save appraisal fee flows to RPC and merchant auth prepare", async () => {
      const nextAuthFeeHkd = 185;

      await runAsAdmin(async () => {
        const saveResult = await updatePlatformFinancialConfig({
          commissionRatePercent: defaultCommissionPercent,
          appraisalFeeHkd: nextAuthFeeHkd,
        });
        expect(saveResult.success).toBe(true);
        if (saveResult.success) {
          expect(saveResult.data.appraisalFeeHkd).toBe(nextAuthFeeHkd);
        }

        const readResult = await getPlatformFinancialConfig();
        expect(readResult.success).toBe(true);
        if (readResult.success) {
          expect(readResult.data.appraisalFeeHkd).toBe(nextAuthFeeHkd);
        }
      });

      expect(await readPlatformAuthFeeHkd()).toBe(nextAuthFeeHkd);

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
          p_meetup_detail: "CC-PLAT-01 auth fee contract",
          p_buyer_remark: null,
          p_user_reward_id: null,
        },
      );
      expect(prepareError).toBeNull();

      const admin = createServiceRoleClient();
      const { data: order } = await admin
        .from("merchant_orders")
        .select("auth_fee")
        .eq("id", orderId)
        .maybeSingle();

      expect(Number(order?.auth_fee)).toBe(nextAuthFeeHkd);

      const { data: settingsRow } = await admin
        .from("platform_settings")
        .select("value, updated_by")
        .eq("key", AUTH_ESCROW_CONFIG_KEY)
        .maybeSingle();

      expect(settingsRow?.updated_by).toBeTruthy();
    });

    merchantIt("CC-PLAT-02: admin save commission rate snapshots on buyer confirm", async () => {
      const nextCommissionPercent = 10;
      const nextCommissionRate = 0.1;

      await runAsAdmin(async () => {
        const saveResult = await updatePlatformFinancialConfig({
          commissionRatePercent: nextCommissionPercent,
          appraisalFeeHkd: DEFAULT_AUTH_FEE_HKD,
        });
        expect(saveResult.success).toBe(true);
        if (saveResult.success) {
          expect(saveResult.data.commissionRatePercent).toBe(nextCommissionPercent);
        }
      });

      expect(await readPlatformCommissionRate()).toBe(nextCommissionRate);

      const buyerId = getBuyerUserId();
      const { orderId, itemSubtotal } = await seedMerchantOrderReadyForBuyerConfirm({
        buyerId,
        suffix: `${runId}-cc-plat-02`,
      });
      createdMerchantOrderIds.push(orderId);

      const { error: confirmError } = await getBuyerClient().rpc(
        "rpc_confirm_merchant_buyer_receipt",
        { p_order_id: orderId },
      );
      expect(confirmError).toBeNull();

      const admin = createServiceRoleClient();
      const { data: order, error } = await admin
        .from("merchant_orders")
        .select("commission_rate_applied, commission_amount, payout_status")
        .eq("id", orderId)
        .maybeSingle();

      expect(error).toBeNull();
      expect(Number(order?.commission_rate_applied)).toBe(nextCommissionRate);
      expect(Number(order?.commission_amount)).toBe(
        Math.round(itemSubtotal * nextCommissionRate * 100) / 100,
      );
      expect(order?.payout_status).toBe("held");

      const { data: settingsRow } = await admin
        .from("platform_settings")
        .select("value, updated_by")
        .eq("key", PLATFORM_FINANCIAL_CONFIG_KEY)
        .maybeSingle();

      expect(settingsRow?.updated_by).toBeTruthy();
    });
  },
);
