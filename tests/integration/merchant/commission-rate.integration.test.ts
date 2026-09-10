import { afterAll, beforeAll, describe, expect } from "vitest";
import { seedMerchantOrderReadyForBuyerConfirm } from "./helpers/merchant-order-fixture";
import {
  hasMerchantGradingEnvVars,
  merchantIt,
  warmMerchantGradingEnv,
} from "../grading/helpers/grading-merchant-env";
import {
  clearSessionCache,
  getBuyerClient,
  getBuyerUserId,
  warmSession,
} from "../shared/auth-context";
import { hasBaseIntegrationEnv } from "../shared/env";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  DEFAULT_COMMISSION_RATE,
  PLATFORM_FINANCIAL_CONFIG_KEY,
} from "@/lib/platform/financial-config";

async function setPlatformCommissionRate(rate: number): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin.from("platform_settings").upsert(
    {
      key: PLATFORM_FINANCIAL_CONFIG_KEY,
      value: { commissionRate: rate },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(`[setPlatformCommissionRate] ${error.message}`);
  }
}

async function readPlatformCommissionRate(): Promise<number> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("fn_platform_commission_rate");
  if (error) {
    throw new Error(`[readPlatformCommissionRate] ${error.message}`);
  }
  return Number(data);
}

describe.skipIf(!hasBaseIntegrationEnv()).sequential(
  "Variable commission integration",
  () => {
    const runId = String(Date.now());
    const createdOrderIds: string[] = [];

    beforeAll(async () => {
      await warmSession("buyer");
      if (hasMerchantGradingEnvVars()) {
        await warmMerchantGradingEnv();
      }
      await setPlatformCommissionRate(DEFAULT_COMMISSION_RATE);
    });

    afterAll(async () => {
      const admin = createServiceRoleClient();
      for (const orderId of createdOrderIds) {
        await admin.from("merchant_orders").delete().eq("id", orderId);
      }
      await setPlatformCommissionRate(DEFAULT_COMMISSION_RATE);
      await clearSessionCache();
    });

    merchantIt("snapshots configured rate on buyer confirm", async () => {
      await setPlatformCommissionRate(0.1);
      expect(await readPlatformCommissionRate()).toBe(0.1);

      const buyerId = getBuyerUserId();
      const { orderId, itemSubtotal } = await seedMerchantOrderReadyForBuyerConfirm({
        buyerId,
        suffix: `${runId}-confirm`,
      });
      createdOrderIds.push(orderId);

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
      expect(Number(order?.commission_rate_applied)).toBe(0.1);
      expect(Number(order?.commission_amount)).toBe(
        Math.round(itemSubtotal * 0.1 * 100) / 100,
      );
      expect(order?.payout_status).toBe("held");
    });

    merchantIt("prepare honours snapshot after settings change during T+7 hold", async () => {
      await setPlatformCommissionRate(DEFAULT_COMMISSION_RATE);

      const buyerId = getBuyerUserId();
      const { orderId } = await seedMerchantOrderReadyForBuyerConfirm({
        buyerId,
        suffix: `${runId}-prepare`,
      });
      createdOrderIds.push(orderId);

      const { error: confirmError } = await getBuyerClient().rpc(
        "rpc_confirm_merchant_buyer_receipt",
        { p_order_id: orderId },
      );
      expect(confirmError).toBeNull();

      const admin = createServiceRoleClient();
      const { data: confirmed, error: confirmedError } = await admin
        .from("merchant_orders")
        .select("commission_rate_applied")
        .eq("id", orderId)
        .maybeSingle();

      expect(confirmedError).toBeNull();
      expect(Number(confirmed?.commission_rate_applied)).toBe(DEFAULT_COMMISSION_RATE);

      await setPlatformCommissionRate(0.1);

      const { error: holdError } = await admin.rpc("rpc_e2e_backdate_merchant_payout_hold", {
        p_order_id: orderId,
      });

      expect(holdError).toBeNull();

      const { data: preparePayload, error: prepareError } = await admin.rpc(
        "rpc_prepare_merchant_order_payout",
        { p_order_id: orderId },
      );

      expect(prepareError).toBeNull();
      expect(preparePayload).toMatchObject({ success: true });

      const { data: afterPrepare, error: afterError } = await admin
        .from("merchant_orders")
        .select("commission_rate_applied, payout_status")
        .eq("id", orderId)
        .maybeSingle();

      expect(afterError).toBeNull();
      expect(Number(afterPrepare?.commission_rate_applied)).toBe(DEFAULT_COMMISSION_RATE);
      expect(afterPrepare?.payout_status).toBe("processing");
    });

    merchantIt("does not rewrite commission snapshot on completed orders when settings change", async () => {
      const admin = createServiceRoleClient();
      const priorOrderId = createdOrderIds[0];
      expect(priorOrderId).toBeTruthy();

      const { data: before, error: beforeError } = await admin
        .from("merchant_orders")
        .select("commission_rate_applied")
        .eq("id", priorOrderId)
        .maybeSingle();

      expect(beforeError).toBeNull();
      const snapshotRate = Number(before?.commission_rate_applied);

      await setPlatformCommissionRate(0.12);
      expect(await readPlatformCommissionRate()).toBe(0.12);

      const { data: after, error: afterError } = await admin
        .from("merchant_orders")
        .select("commission_rate_applied")
        .eq("id", priorOrderId)
        .maybeSingle();

      expect(afterError).toBeNull();
      expect(Number(after?.commission_rate_applied)).toBe(snapshotRate);
    });
  },
);
