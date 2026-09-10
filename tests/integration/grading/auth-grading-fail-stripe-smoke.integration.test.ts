import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearSessionCache,
  getAdminClient,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasGradingStripeSmokeEnv } from "../shared/env";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  executeGradingFailStripeLeg,
  finalizeAuthGradingFail,
  prepareAuthGradingFail,
  retrievePaymentIntent,
  seedGradingFailStripeSmokeOrder,
} from "./helpers/grading-stripe-smoke-fixture";
import {
  getMemberOrderGradingFailRow,
  getSellerReceivableForOrder,
} from "./helpers/grading-fail-fixture";

describe.skipIf(!hasGradingStripeSmokeEnv()).sequential(
  "G-BF-S Stripe smoke — single capture grading fail",
  () => {
    const tracked = { orderIds: [] as string[] };

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
    });

    afterAll(async () => {
      await wipeCouponFsmRun({
        orderIds: tracked.orderIds,
        userRewardIds: [],
        templateIds: [],
      });
      await clearSessionCache();
    });

    it("G-BF-S1: buyer fault captures auth_fee only on real Stripe PI", async () => {
      const ctx = await seedGradingFailStripeSmokeOrder();
      tracked.orderIds.push(ctx.orderId);

      const prepared = await runAsAdmin(async () => {
        const client = getAdminClient();
        return prepareAuthGradingFail(client, {
          orderId: ctx.orderId,
          faultParty: "buyer",
          reason: "stripe smoke buyer fault",
        });
      });

      expect(prepared.success).toBe(true);
      expect(prepared.void_mode).toBe("capture_auth_fee_only");
      expect(prepared.capture_cents).toBe(ctx.authFeeCents);
      expect(prepared.escrow_capture_model).toBe("single");

      await executeGradingFailStripeLeg(prepared, ctx.orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        await finalizeAuthGradingFail(client, {
          orderId: ctx.orderId,
          paymentIntentId: ctx.paymentIntentId,
        });
      });

      const pi = await retrievePaymentIntent(ctx.paymentIntentId);
      expect(pi.status).toBe("succeeded");
      expect(pi.amount_received).toBe(ctx.authFeeCents);
      expect(pi.amount_capturable).toBe(0);

      const row = await getMemberOrderGradingFailRow(ctx.orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("auth_fee_captured");
      expect(row?.fault_party).toBe("buyer");

      const receivable = await getSellerReceivableForOrder(ctx.orderId);
      expect(receivable).toBeNull();
    });

    it("G-BF-S2: seller fault cancels real Stripe PI with zero capture", async () => {
      const ctx = await seedGradingFailStripeSmokeOrder();
      tracked.orderIds.push(ctx.orderId);

      const prepared = await runAsAdmin(async () => {
        const client = getAdminClient();
        return prepareAuthGradingFail(client, {
          orderId: ctx.orderId,
          faultParty: "seller",
          reason: "stripe smoke seller fault",
        });
      });

      expect(prepared.success).toBe(true);
      expect(prepared.void_mode).toBe("cancel");

      await executeGradingFailStripeLeg(prepared, ctx.orderId);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        await finalizeAuthGradingFail(client, {
          orderId: ctx.orderId,
          paymentIntentId: ctx.paymentIntentId,
        });
      });

      const pi = await retrievePaymentIntent(ctx.paymentIntentId);
      expect(pi.status).toBe("canceled");
      expect(pi.amount_received ?? 0).toBe(0);

      const row = await getMemberOrderGradingFailRow(ctx.orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("voided");
      expect(row?.fault_party).toBe("seller");

      const receivable = await getSellerReceivableForOrder(ctx.orderId);
      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBeGreaterThan(0);
    });

    it("G-BF-S3: webhook finalize helper completes buyer fault after Stripe capture", async () => {
      const { finalizeAuthGradingFailFromWebhook } = await import(
        "@/lib/payments/auth-grading-fail-void-saga"
      );
      const ctx = await seedGradingFailStripeSmokeOrder();
      tracked.orderIds.push(ctx.orderId);

      const prepared = await runAsAdmin(async () => {
        const client = getAdminClient();
        return prepareAuthGradingFail(client, {
          orderId: ctx.orderId,
          faultParty: "buyer",
          reason: "stripe smoke webhook finalize",
        });
      });

      await executeGradingFailStripeLeg(prepared, ctx.orderId);

      const pi = await retrievePaymentIntent(ctx.paymentIntentId);
      const result = await finalizeAuthGradingFailFromWebhook({
        orderKind: "member",
        orderId: ctx.orderId,
        paymentIntent: pi,
      });
      expect(result).toEqual({ ok: true });

      const row = await getMemberOrderGradingFailRow(ctx.orderId);
      expect(row?.auth_result).toBe("failed");
      expect(row?.payment_capture_status).toBe("auth_fee_captured");
    });
  },
);
