import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mapResolutionOptionToInput } from "@/lib/moderation/resolution-config";
import { resolveAdminModerationCase } from "@/app/actions/admin-moderation";
import {
  clearSessionCache,
  getAdminClient,
  getBuyerUserId,
  runAsAdmin,
  warmSession,
} from "../shared/auth-context";
import { createServiceRoleClient } from "../shared/supabase-admin";
import {
  findMemberListingForIntegration,
} from "../rewards/helpers/checkout-fixture";
import { assertMerchantGradingEnvReady } from "../grading/helpers/grading-merchant-env";
import { wipeModerationMatrixPair, releasePhaseHStripeRefundIds } from "./helpers/cleanup";
import { getSellerId, hasFullModerationIntegrationEnv } from "./helpers/env";
import {
  countSanctionsForCase,
  getMemberOrderRefundStatus,
  getMerchantOrderRefundStatus,
  assertModerationOrderRefundEligible,
  seedMemberAuthRefundEligibleOrder,
  seedMerchantAuthRefundEligibleOrder,
  seedMerchantDirectRefundEligibleOrder,
  seedModerationCaseWithMemberOrderContext,
  seedModerationCaseWithMerchantOrderContext,
} from "./helpers/phase-h-fixtures";

describe.skipIf(!hasFullModerationIntegrationEnv()).sequential(
  "Phase H moderation refund integration",
  () => {
    const runId = String(Date.now());
    const buyerId = () => getBuyerUserId();
    let phaseHMerchantId = "";
    let phaseHMemberSellerId = "";

    const wipeMemberSellerPair = async () => {
      if (phaseHMemberSellerId) {
        await wipeModerationMatrixPair({
          reporterId: buyerId(),
          subjectId: phaseHMemberSellerId,
        });
      }
    };

    beforeAll(async () => {
      await warmSession("admin");
      await warmSession("buyer");
      await warmSession("seller");
      await assertMerchantGradingEnvReady();
      phaseHMerchantId = getSellerId();
      phaseHMemberSellerId = (
        await findMemberListingForIntegration({ excludeBuyerId: getBuyerUserId() })
      ).sellerId;
    });

    beforeEach(async () => {
      await releasePhaseHStripeRefundIds();
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: getSellerId(),
      });
      if (phaseHMerchantId) {
        await wipeModerationMatrixPair({
          reporterId: buyerId(),
          subjectId: phaseHMerchantId,
        });
      }
      await wipeMemberSellerPair();
    });

    afterAll(async () => {
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: getSellerId(),
      });
      if (phaseHMerchantId) {
        await wipeModerationMatrixPair({
          reporterId: buyerId(),
          subjectId: phaseHMerchantId,
        });
      }
      await wipeMemberSellerPair();
      await clearSessionCache();
    });

    it("I-H1 merchant_direct eligible + prepare via resolve RPC", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H1",
      });
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H1",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "merchant",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "seller",
            },
          },
        });

        expect(error).toBeNull();
        expect(data).toMatchObject({
          success: true,
          orderRefundPrepared: true,
        });
      });

      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("processing");
    });

    it("I-H2 merchant_auth eligible + prepare via resolve RPC", async () => {
      const seed = await seedMerchantAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H2",
      });
      await assertModerationOrderRefundEligible(seed.orderId, "merchant_auth");

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H2",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "merchant",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "seller",
            },
          },
        });

        expect(error).toBeNull();
        expect(data).toMatchObject({
          success: true,
          orderRefundPrepared: true,
        });
      });

      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("processing");
    });

    it("I-H2M: merchant_auth finalize via admin session sets terminal state + ledger", async () => {
      const seed = await seedMerchantAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H2M",
      });
      phaseHMerchantId = seed.merchantId;
      await assertModerationOrderRefundEligible(seed.orderId, "merchant_auth");

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H2M",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("merchant_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "seller",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H2M_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: 3.5,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("merchant_orders")
        .select(
          "refund_status, escrow_status, fault_party, stripe_refund_id",
        )
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.escrow_status).toBe("refunded");
      expect(order?.fault_party).toBe("seller");
      expect(order?.stripe_refund_id).toBe(`re_phase_h_I-H2M_${runId}`);

      const { data: ledger } = await admin
        .from("merchant_ledgers")
        .select("order_id, amount, transaction_type")
        .eq("order_id", seed.orderId)
        .eq("transaction_type", "grading_fail_recovery")
        .maybeSingle();

      expect(ledger).not.toBeNull();
      expect(Number(ledger?.amount ?? 0)).toBeLessThan(0);
    });

    it("I-H3 member_auth eligible + prepare via resolve RPC", async () => {
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H3",
      });
      phaseHMemberSellerId = seed.sellerId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
      });
      await assertModerationOrderRefundEligible(seed.orderId, "member_auth");

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H3",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "member",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "seller",
            },
          },
        });

        expect(error).toBeNull();
        expect(data).toMatchObject({
          success: true,
          orderRefundPrepared: true,
        });
      });

      expect(await getMemberOrderRefundStatus(seed.orderId)).toBe("processing");
    });

    it("I-H3b member_auth buyer fault prepares refund preview and resolve", async () => {
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H3b",
      });
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
      });
      await assertModerationOrderRefundEligible(seed.orderId, "member_auth");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: preview, error: previewError } = await client.rpc(
          "fn_preview_moderation_order_refund_breakdown",
          {
            p_order_id: seed.orderId,
            p_fault_party: "buyer",
          },
        );
        expect(previewError).toBeNull();
        expect(Number(preview?.eligiblePolicyHkd ?? 0)).toBeGreaterThan(0);
        expect(Number(preview?.refundToBuyerHkd ?? 0)).toBeLessThanOrEqual(
          Number(preview?.eligiblePolicyHkd ?? 0),
        );
      });

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H3b",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "member",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "buyer",
            },
          },
        });

        expect(error).toBeNull();
        expect(data).toMatchObject({
          success: true,
          orderRefundPrepared: true,
        });
      });

      expect(await getMemberOrderRefundStatus(seed.orderId)).toBe("processing");
    });

    it("I-H2b merchant_auth buyer fault prepares refund preview and resolve", async () => {
      const seed = await seedMerchantAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H2b",
      });
      await assertModerationOrderRefundEligible(seed.orderId, "merchant_auth");

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: preview, error: previewError } = await client.rpc(
          "fn_preview_moderation_order_refund_breakdown",
          {
            p_order_id: seed.orderId,
            p_fault_party: "buyer",
          },
        );
        expect(previewError).toBeNull();
        expect(Number(preview?.eligiblePolicyHkd ?? 0)).toBeGreaterThan(0);
        expect(Number(preview?.refundToBuyerHkd ?? 0)).toBeLessThanOrEqual(
          Number(preview?.eligiblePolicyHkd ?? 0),
        );
      });

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H2b",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "merchant",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "buyer",
            },
          },
        });

        expect(error).toBeNull();
        expect(data).toMatchObject({
          success: true,
          orderRefundPrepared: true,
        });
      });

      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("processing");
    });

    it("I-H4 past window blocks prepare", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H4",
      });
      const admin = createServiceRoleClient();
      const { error: backdateError } = await admin.rpc(
        "rpc_e2e_backdate_merchant_payout_hold",
        { p_order_id: seed.orderId },
      );
      expect(backdateError).toBeNull();

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H4",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_prepare_moderation_order_refund", {
          p_case_id: caseId,
          p_order_id: seed.orderId,
          p_fault_party: "seller",
        });
        expect(error?.message).toContain("窗口");
      });
    });

    it("I-H5 resolve without refund leaves refund_status unchanged", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H5",
      });
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H5",
      });

      await runAsAdmin(async () => {
        const result = await resolveAdminModerationCase({
          caseId,
          ...mapResolutionOptionToInput("upheld_warn_only", "merchant"),
        });
        expect(result.success).toBe(true);
      });

      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("none");
    });

    it("I-H6b upheld_warn_only + refund has no sanction and prepares refund", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H6b",
      });
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H6b",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "merchant",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "seller",
            },
          },
        });
        expect(error).toBeNull();
      });

      expect(await countSanctionsForCase(caseId)).toBe(0);
      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("processing");
    });

    it("I-H7 unrelated order is rejected", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H7",
      });
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H7-base",
      });

      const unrelatedOrderId = crypto.randomUUID();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_prepare_moderation_order_refund", {
          p_case_id: caseId,
          p_order_id: unrelatedOrderId,
          p_fault_party: "seller",
        });
        expect(error?.message).toContain("無關聯");
      });
    });

    it("I-H9 finalize with fake refund id sets terminal state", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H9",
      });
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H9",
      });

      const admin = createServiceRoleClient();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_prepare_moderation_order_refund", {
          p_case_id: caseId,
          p_order_id: seed.orderId,
          p_fault_party: "seller",
        });
        expect(error).toBeNull();
      });

      const { error: finalizeError } = await admin.rpc(
        "rpc_finalize_moderation_order_refund",
        {
          p_order_id: seed.orderId,
          p_payment_intent_id: "pi_phase_h_I-H9",
          p_refund_id: `re_phase_h_fake_${runId}`,
          p_refund_cents: 10000,
          p_stripe_fee_hkd: 3.5,
          p_case_id: caseId,
        },
      );
      expect(finalizeError).toBeNull();

      const { data: order } = await admin
        .from("merchant_orders")
        .select("refund_status, escrow_status")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.escrow_status).toBe("refunded");
    });

    it("I-H10 member_auth finalize via admin session sets terminal state", async () => {
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H10",
      });
      phaseHMemberSellerId = seed.sellerId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
      });

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H10",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("member_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "seller",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H10_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: 3.5,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("member_orders")
        .select("refund_status, escrow_status, status, fault_party")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.escrow_status).toBe("cancelled");
      expect(order?.status).toBe("cancelled");
      expect(order?.fault_party).toBe("seller");

      const { data: receivable } = await admin
        .from("seller_receivables")
        .select("order_id, amount_hkd, status")
        .eq("order_kind", "member")
        .eq("order_id", seed.orderId)
        .maybeSingle();

      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBeGreaterThan(0);
    });

    it("I-H15 member_auth carrier(seller): finalize creates seller receivable", async () => {
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H15",
      });
      phaseHMemberSellerId = seed.sellerId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
      });

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H15",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("member_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "carrier",
            p_carrier_liability_party: "seller",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H15_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: 3.5,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("member_orders")
        .select("refund_status, fault_party")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.fault_party).toBe("carrier");

      const { data: receivable } = await admin
        .from("seller_receivables")
        .select("order_id, amount_hkd, stripe_fee_hkd, status")
        .eq("order_kind", "member")
        .eq("order_id", seed.orderId)
        .maybeSingle();

      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBeGreaterThan(0);
      expect(Number(receivable?.stripe_fee_hkd ?? 0)).toBe(3.5);
    });

    it("I-H15b member_auth carrier(platform): finalize has no seller receivable", async () => {
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H15b",
      });
      phaseHMemberSellerId = seed.sellerId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
      });

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H15b",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("member_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "carrier",
            p_carrier_liability_party: "platform",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H15b_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: 3.5,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("member_orders")
        .select("refund_status, fault_party")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.fault_party).toBe("carrier");

      const { data: receivable } = await admin
        .from("seller_receivables")
        .select("order_id")
        .eq("order_kind", "member")
        .eq("order_id", seed.orderId)
        .maybeSingle();

      expect(receivable).toBeNull();
    });

    it("I-H16 member_auth inconclusive: seller receivable is stripe_fee/2 only", async () => {
      const mockStripeFeeHkd = 4.0;
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H16",
      });
      phaseHMemberSellerId = seed.sellerId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
      });

      const { caseId } = await seedModerationCaseWithMemberOrderContext({
        reporterId: buyerId(),
        subjectId: seed.sellerId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H16",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("member_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: prepareData, error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "inconclusive",
          },
        );
        expect(prepareError).toBeNull();
        expect(prepareData).toMatchObject({
          success: true,
          feeRecoveryMode: "fee_half",
        });

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H16_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: mockStripeFeeHkd / 2,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("member_orders")
        .select("refund_status, fault_party")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.fault_party).toBe("inconclusive");

      const { data: receivable } = await admin
        .from("seller_receivables")
        .select("order_id, amount_hkd, stripe_fee_hkd")
        .eq("order_kind", "member")
        .eq("order_id", seed.orderId)
        .maybeSingle();

      expect(receivable).not.toBeNull();
      expect(Number(receivable?.amount_hkd ?? 0)).toBe(mockStripeFeeHkd / 2);
      expect(receivable?.stripe_fee_hkd).toBeNull();
    });

    it("I-H15M merchant_auth carrier(seller): finalize creates merchant ledger recovery", async () => {
      const mockStripeFeeHkd = 3.5;
      const seed = await seedMerchantAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H15M",
      });
      phaseHMerchantId = seed.merchantId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
      });

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H15M",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("merchant_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "carrier",
            p_carrier_liability_party: "seller",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H15M_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: mockStripeFeeHkd,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("merchant_orders")
        .select("refund_status, fault_party")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.fault_party).toBe("carrier");

      const { data: ledger } = await admin
        .from("merchant_ledgers")
        .select("order_id, amount, transaction_type")
        .eq("order_id", seed.orderId)
        .eq("transaction_type", "grading_fail_recovery")
        .maybeSingle();

      expect(ledger).not.toBeNull();
      expect(Number(ledger?.amount ?? 0)).toBeLessThan(0);
      expect(Math.abs(Number(ledger?.amount ?? 0))).toBeGreaterThan(mockStripeFeeHkd);
    });

    it("I-H15bM merchant_auth carrier(platform): finalize has no merchant ledger", async () => {
      const seed = await seedMerchantAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H15bM",
      });
      phaseHMerchantId = seed.merchantId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
      });

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H15bM",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("merchant_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "carrier",
            p_carrier_liability_party: "platform",
          },
        );
        expect(prepareError).toBeNull();

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H15bM_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: 3.5,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: ledger } = await admin
        .from("merchant_ledgers")
        .select("order_id")
        .eq("order_id", seed.orderId)
        .eq("transaction_type", "grading_fail_recovery")
        .maybeSingle();

      expect(ledger).toBeNull();
    });

    it("I-H16M merchant_auth inconclusive: merchant ledger is stripe_fee/2 only", async () => {
      const mockStripeFeeHkd = 4.0;
      const seed = await seedMerchantAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H16M",
      });
      phaseHMerchantId = seed.merchantId;
      await wipeModerationMatrixPair({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
      });

      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H16M",
      });

      const admin = createServiceRoleClient();
      const { data: orderBefore } = await admin
        .from("merchant_orders")
        .select("stripe_payment_intent_id")
        .eq("id", seed.orderId)
        .single();

      const paymentIntentId = orderBefore?.stripe_payment_intent_id;
      expect(paymentIntentId).toBeTruthy();

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data: prepareData, error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "inconclusive",
          },
        );
        expect(prepareError).toBeNull();
        expect(prepareData).toMatchObject({
          success: true,
          feeRecoveryMode: "fee_half",
        });

        const { error: finalizeError } = await client.rpc(
          "rpc_finalize_moderation_order_refund",
          {
            p_order_id: seed.orderId,
            p_payment_intent_id: paymentIntentId!,
            p_refund_id: `re_phase_h_I-H16M_${runId}`,
            p_refund_cents: 10000,
            p_stripe_fee_hkd: mockStripeFeeHkd / 2,
            p_case_id: caseId,
          },
        );
        expect(finalizeError).toBeNull();
      });

      const { data: order } = await admin
        .from("merchant_orders")
        .select("refund_status, fault_party")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.fault_party).toBe("inconclusive");

      const { data: ledger } = await admin
        .from("merchant_ledgers")
        .select("order_id, amount, transaction_type")
        .eq("order_id", seed.orderId)
        .eq("transaction_type", "grading_fail_recovery")
        .maybeSingle();

      expect(ledger).not.toBeNull();
      expect(Number(ledger?.amount ?? 0)).toBe(-(mockStripeFeeHkd / 2));
    });

    it("I-H12 failed + in-window excluded from payout candidates", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H12",
      });

      const admin = createServiceRoleClient();
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H12",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error: prepareError } = await client.rpc(
          "rpc_prepare_moderation_order_refund",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
            p_fault_party: "seller",
          },
        );
        expect(prepareError).toBeNull();
      });

      const { error: failError } = await admin.rpc(
        "rpc_mark_moderation_order_refund_failed",
        {
          p_order_id: seed.orderId,
          p_error: "integration fixture",
          p_case_id: caseId,
        },
      );
      expect(failError).toBeNull();

      const { data, error } = await admin.rpc(
        "rpc_list_merchant_connect_payout_candidates",
        { p_limit: 200 },
      );

      expect(error).toBeNull();
      const ids = (data ?? []).map((row: { order_id: string }) => row.order_id);
      expect(ids).not.toContain(seed.orderId);
    });

    it("I-H17 preview RPC returns breakdown without mutating order", async () => {
      const seed = await seedMemberAuthRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H17",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc(
          "fn_preview_moderation_order_refund_breakdown",
          {
            p_order_id: seed.orderId,
            p_fault_party: "seller",
          },
        );
        expect(error).toBeNull();
        expect(Number(data?.eligiblePolicyHkd ?? 0)).toBeGreaterThan(0);
        expect(data?.stripeFeeHkd == null).toBe(true);
        expect(data?.stripeFeeNote).toMatch(/Stripe/);
      });

      expect(await getMemberOrderRefundStatus(seed.orderId)).toBe("none");
    });

    it("I-H18: failed refund retry prepare then finalize sets refunded", async () => {
      const seed = await seedMerchantDirectRefundEligibleOrder({
        buyerId: buyerId(),
        runId,
        suffix: "I-H18",
      });
      const { caseId } = await seedModerationCaseWithMerchantOrderContext({
        reporterId: buyerId(),
        subjectId: seed.merchantId,
        orderId: seed.orderId,
        runId,
        suffix: "I-H18",
      });

      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { error } = await client.rpc("rpc_resolve_moderation_case", {
          p_case_id: caseId,
          p_payload: {
            resolution: "upheld",
            violationPersona: "merchant",
            orderRefund: {
              enabled: true,
              orderId: seed.orderId,
              faultParty: "seller",
            },
          },
        });
        expect(error).toBeNull();
      });

      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("processing");

      const admin = createServiceRoleClient();
      const { error: failError } = await admin.rpc(
        "rpc_mark_moderation_order_refund_failed",
        {
          p_order_id: seed.orderId,
          p_error: "integration fixture I-H18",
          p_case_id: caseId,
        },
      );
      expect(failError).toBeNull();
      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("failed");

      let refundCents = 0;
      let paymentIntentId = "";
      await runAsAdmin(async () => {
        const client = getAdminClient();
        const { data, error } = await client.rpc(
          "rpc_retry_moderation_order_refund_prepare",
          {
            p_case_id: caseId,
            p_order_id: seed.orderId,
          },
        );
        expect(error).toBeNull();
        const payload = data as {
          success?: boolean;
          refundCents?: number;
          paymentIntentId?: string;
        };
        expect(payload.success).toBe(true);
        refundCents = Number(payload.refundCents ?? 0);
        paymentIntentId = payload.paymentIntentId ?? "";
        expect(refundCents).toBeGreaterThan(0);
        expect(paymentIntentId).toBeTruthy();
      });

      expect(await getMerchantOrderRefundStatus(seed.orderId)).toBe("processing");

      const { error: finalizeError } = await admin.rpc(
        "rpc_finalize_moderation_order_refund",
        {
          p_order_id: seed.orderId,
          p_payment_intent_id: paymentIntentId,
          p_refund_id: `re_phase_h_I-H18_${runId}`,
          p_refund_cents: refundCents,
          p_stripe_fee_hkd: 3.5,
          p_case_id: caseId,
        },
      );
      expect(finalizeError).toBeNull();

      const { data: order } = await admin
        .from("merchant_orders")
        .select("refund_status, escrow_status")
        .eq("id", seed.orderId)
        .single();

      expect(order?.refund_status).toBe("refunded");
      expect(order?.escrow_status).toBe("refunded");
    });
  },
);
