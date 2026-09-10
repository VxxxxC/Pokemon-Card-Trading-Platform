import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_GRADING_OPTION_ID,
  getGradingOption,
  gradingOptionToFields,
} from "@/lib/grading/options";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerClient,
  getBuyerUserId,
  getSellerClient,
  runAsAdmin,
  runAsBuyer,
  warmSession,
} from "../shared/auth-context";
import { hasMerchantGradingStripeSmokeEnv } from "../shared/env";
import { wipeCouponFsmRun } from "../rewards/helpers/cleanup";
import {
  getMerchantGradingContext,
  requireMerchantGradingEnvReady,
} from "./helpers/grading-merchant-env";
import { getMerchantOrderGradingFailRow } from "./helpers/grading-merchant-fixture";
import {
  executeGradingPassStripeLeg,
  finalizeMerchantAuthGradingPass,
  prepareMerchantAuthGradingPass,
  retrievePaymentIntent,
  seedMerchantGradingPassStripeSmokeOrder,
} from "./helpers/grading-stripe-smoke-fixture";

const PASS_GRADING = gradingOptionToFields(
  getGradingOption(DEFAULT_GRADING_OPTION_ID),
);

describe.skipIf(!hasMerchantGradingStripeSmokeEnv()).sequential(
  "G-BP-SM Stripe smoke — merchant_auth single capture grading pass",
  () => {
    const tracked = { orderIds: [] as string[] };

    beforeAll(async () => {
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

    it("G-BP-S1M: merchant_auth single-capture pass captures full buyer total on real Stripe PI", async () => {
      const ctx = getMerchantGradingContext();
      expect(ctx).toBeTruthy();

      const seeded = await runAsBuyer(async () => {
        return seedMerchantGradingPassStripeSmokeOrder({
          listingId: ctx!.listingId,
          buyerId: getBuyerUserId(),
          sellerId: ctx!.sellerId,
          buyerClient: getBuyerClient(),
          sellerClient: getSellerClient(),
          adminClient: getAdminClient(),
        });
      });
      tracked.orderIds.push(seeded.orderId);

      const prepared = await runAsAdmin(async () => {
        const client = getAdminClient();
        return prepareMerchantAuthGradingPass(client, {
          orderId: seeded.orderId,
          gradingCompany: PASS_GRADING.grader,
          gradingScore: PASS_GRADING.gradeScore,
          notes: "stripe smoke merchant pass",
        });
      });

      expect(prepared.success).toBe(true);
      expect(prepared.escrow_capture_model).toBe("single");
      expect(prepared.capture_cents).toBe(seeded.buyerTotalCents);

      const captured = await executeGradingPassStripeLeg(
        prepared,
        seeded.orderId,
        {
          company: PASS_GRADING.grader,
          score: PASS_GRADING.gradeScore,
        },
        { orderKind: "merchant", stripeMetadataOrderKind: "merchant_auth" },
      );

      expect(captured.status).toBe("succeeded");
      expect(captured.amount_received).toBe(seeded.buyerTotalCents);

      await runAsAdmin(async () => {
        const client = getAdminClient();
        await finalizeMerchantAuthGradingPass(client, {
          orderId: seeded.orderId,
          paymentIntentId: seeded.paymentIntentId,
          capturedAmountCents: captured.amount_received,
          adminId: prepared.admin_id!,
          gradingCompany: PASS_GRADING.grader,
          gradingScore: PASS_GRADING.gradeScore,
          notes: "stripe smoke merchant pass",
        });
      });

      const pi = await retrievePaymentIntent(seeded.paymentIntentId);
      expect(pi.status).toBe("succeeded");
      expect(pi.amount_received).toBe(seeded.buyerTotalCents);
      expect(pi.amount_capturable).toBe(0);

      const row = await getMerchantOrderGradingFailRow(seeded.orderId);
      expect(row?.auth_result).toBe("passed");
      expect(row?.payment_capture_status).toBe("fully_captured");
    });
  },
);
