import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_GRADING_OPTION_ID,
  getGradingOption,
  gradingOptionToFields,
} from "@/lib/grading/options";
import {
  clearSessionCache,
  getAdminClient,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { hasGradingStripeSmokeEnv } from "../shared/env";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import { getMemberOrderGradingFailRow } from "./helpers/grading-fail-fixture";
import {
  executeGradingPassStripeLeg,
  finalizeAuthGradingPass,
  prepareAuthGradingPass,
  retrievePaymentIntent,
  seedGradingPassStripeSmokeOrder,
} from "./helpers/grading-stripe-smoke-fixture";

const PASS_GRADING = gradingOptionToFields(
  getGradingOption(DEFAULT_GRADING_OPTION_ID),
);

describe.skipIf(!hasGradingStripeSmokeEnv()).sequential(
  "G-BP-S Stripe smoke — single capture grading pass",
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

    it("G-BP-S1: member_auth single-capture pass captures full buyer total on real Stripe PI", async () => {
      const ctx = await seedGradingPassStripeSmokeOrder();
      tracked.orderIds.push(ctx.orderId);

      const prepared = await runAsAdmin(async () => {
        const client = getAdminClient();
        return prepareAuthGradingPass(client, {
          orderId: ctx.orderId,
          gradingCompany: PASS_GRADING.grader,
          gradingScore: PASS_GRADING.gradeScore,
          notes: "stripe smoke pass",
        });
      });

      expect(prepared.success).toBe(true);
      expect(prepared.escrow_capture_model).toBe("single");
      expect(prepared.capture_cents).toBe(ctx.buyerTotalCents);

      const captured = await executeGradingPassStripeLeg(prepared, ctx.orderId, {
        company: PASS_GRADING.grader,
        score: PASS_GRADING.gradeScore,
      });

      expect(captured.status).toBe("succeeded");
      expect(captured.amount_received).toBe(ctx.buyerTotalCents);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        await finalizeAuthGradingPass(client, {
          orderId: ctx.orderId,
          paymentIntentId: ctx.paymentIntentId,
          capturedAmountCents: captured.amount_received,
          adminId: prepared.admin_id!,
          gradingCompany: PASS_GRADING.grader,
          gradingScore: PASS_GRADING.gradeScore,
          notes: "stripe smoke pass",
        });
      });

      const pi = await retrievePaymentIntent(ctx.paymentIntentId);
      expect(pi.status).toBe("succeeded");
      expect(pi.amount_received).toBe(ctx.buyerTotalCents);
      expect(pi.amount_capturable).toBe(0);

      const row = await getMemberOrderGradingFailRow(ctx.orderId);
      expect(row?.auth_result).toBe("passed");
      expect(row?.payment_capture_status).toBe("fully_captured");
    });
  },
);
