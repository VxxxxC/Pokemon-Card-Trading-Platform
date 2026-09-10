import { afterAll, beforeAll, describe, expect } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerClient,
  getBuyerUserId,
  getSellerClient,
  runAsAdmin,
  runAsSeller,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import { seedPendingMerchantOrders } from "../rewards/helpers/checkout-fixture";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  getMerchantGradingContext,
  hasMerchantGradingEnvVars,
  merchantIt,
  requireMerchantGradingEnvReady,
} from "./helpers/grading-merchant-env";
import {
  authorizeMerchantAuthOrderForPipeline,
  finalizeMerchantAuthOrderIntake,
  getMerchantOrderMerchantId,
  submitMerchantAuthInboundForPipeline,
} from "./helpers/grading-merchant-fixture";

describe.sequential(
  "auth grading merchant cancel (integration)",
  () => {
    const tracked = { orderIds: [] as string[] };
    const paymentIntentId = `pi_mcan_${Date.now()}`;

    beforeAll(async () => {
      if (!hasMerchantGradingEnvVars()) {
        throw new Error("Missing merchant grading env vars (E2E_SELLER_* + E2E_LISTING_ID)");
      }
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
      await requireMerchantGradingEnvReady();
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    merchantIt(
      "G-CAN1M: merchant can cancel authorized auth order before intake",
      async () => {
        const ctx = getMerchantGradingContext();
        if (!ctx) {
          throw new Error("merchant grading context missing");
        }

        const buyerId = getBuyerUserId();
        const [orderId] = await seedPendingMerchantOrders(
          buyerId,
          ctx.listingId,
          1,
        );
        tracked.orderIds.push(orderId);

        const piId = `${paymentIntentId}_1`;
        await authorizeMerchantAuthOrderForPipeline(
          getBuyerClient(),
          orderId,
          piId,
        );

        const merchantId = await getMerchantOrderMerchantId(orderId);
        expect(merchantId).toBe(ctx.sellerId);

        const admin = createServiceRoleClient();
        const { data: beforeRow } = await admin
          .from("merchant_orders")
          .select(
            "listing_id, escrow_status, platform_received_at, payment_capture_status, requires_authentication",
          )
          .eq("id", orderId)
          .maybeSingle();

        expect(beforeRow?.requires_authentication).toBe(true);
        expect(beforeRow?.escrow_status).toBe("payment_held");
        expect(beforeRow?.platform_received_at).toBeNull();
        expect(beforeRow?.payment_capture_status).toBe("authorized");

        await runAsSeller(async () => {
          const client = getSellerClient();
          const { error } = await client.rpc("rpc_cancel_merchant_auth_order", {
            p_order_id: orderId,
            p_merchant_id: merchantId,
          });
          expect(error).toBeNull();
        });

        const { data: afterRow } = await admin
          .from("merchant_orders")
          .select("escrow_status, payment_capture_status")
          .eq("id", orderId)
          .maybeSingle();

        expect(afterRow?.escrow_status).toBe("refunded");
        expect(afterRow?.payment_capture_status).toBe("voided");

        const { data: listingRow } = await admin
          .from("listings")
          .select("status")
          .eq("id", beforeRow?.listing_id ?? "")
          .maybeSingle();
        expect(listingRow?.status).toBe("active");
      },
    );

    merchantIt(
      "G-CAN1M-b: cancel allowed after inbound tracking but before admin intake",
      async () => {
        const ctx = getMerchantGradingContext();
        if (!ctx) {
          throw new Error("merchant grading context missing");
        }

        const buyerId = getBuyerUserId();
        const [orderId] = await seedPendingMerchantOrders(
          buyerId,
          ctx.listingId,
          1,
        );
        tracked.orderIds.push(orderId);

        const piId = `${paymentIntentId}_1b`;
        await authorizeMerchantAuthOrderForPipeline(
          getBuyerClient(),
          orderId,
          piId,
        );

        const merchantId = await getMerchantOrderMerchantId(orderId);

        await submitMerchantAuthInboundForPipeline(
          orderId,
          merchantId,
          {
            trackingNo: `SF-CAN1M-${orderId.slice(0, 8)}`,
            courierName: "SF Express",
          },
          getSellerClient(),
        );

        await runAsSeller(async () => {
          const client = getSellerClient();
          const { error } = await client.rpc("rpc_cancel_merchant_auth_order", {
            p_order_id: orderId,
            p_merchant_id: merchantId,
          });
          expect(error).toBeNull();
        });

        const admin = createServiceRoleClient();
        const { data: afterRow } = await admin
          .from("merchant_orders")
          .select("escrow_status, payment_capture_status, platform_received_at")
          .eq("id", orderId)
          .maybeSingle();

        expect(afterRow?.platform_received_at).toBeNull();
        expect(afterRow?.escrow_status).toBe("refunded");
        expect(afterRow?.payment_capture_status).toBe("voided");
      },
    );

    merchantIt(
      "G-CAN2M: cancel rejected after admin intake (authenticating)",
      async () => {
        const ctx = getMerchantGradingContext();
        if (!ctx) {
          throw new Error("merchant grading context missing");
        }

        const buyerId = getBuyerUserId();
        const [orderId] = await seedPendingMerchantOrders(
          buyerId,
          ctx.listingId,
          1,
        );
        tracked.orderIds.push(orderId);

        const piId = `${paymentIntentId}_2`;
        await authorizeMerchantAuthOrderForPipeline(
          getBuyerClient(),
          orderId,
          piId,
        );

        const merchantId = await getMerchantOrderMerchantId(orderId);

        await submitMerchantAuthInboundForPipeline(
          orderId,
          merchantId,
          {
            trackingNo: `SF-CAN2M-${orderId.slice(0, 8)}`,
            courierName: "SF Express",
          },
          getSellerClient(),
        );

        await runAsAdmin(async () => {
          await finalizeMerchantAuthOrderIntake({
            orderId,
            paymentIntentId: piId,
            adminClient: getAdminClient(),
          });
        });

        const admin = createServiceRoleClient();
        const { data: midRow } = await admin
          .from("merchant_orders")
          .select("escrow_status, platform_received_at")
          .eq("id", orderId)
          .maybeSingle();
        expect(midRow?.escrow_status).toBe("authenticating");
        expect(midRow?.platform_received_at).not.toBeNull();

        await runAsSeller(async () => {
          const client = getSellerClient();
          const { error } = await client.rpc("rpc_cancel_merchant_auth_order", {
            p_order_id: orderId,
            p_merchant_id: merchantId,
          });
          expect(error).not.toBeNull();
          expect(error?.message).toContain("鑑定期間不可取消");
        });
      },
    );
  },
);
