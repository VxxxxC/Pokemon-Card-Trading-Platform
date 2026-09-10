import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getMerchantProductDetailFixtures } from "../fixtures/test-data";
import {
  confirmMerchantBuyerReceipt,
  createE2eStripeClient,
  getMerchantOrderReconcileSnapshot,
  hasStripeReconcileEnv,
  submitMerchantDirectFulfillment,
  waitForMerchantOrderPaymentHeld,
  type MerchantOrderReconcileSnapshot,
} from "./stripe-reconcile";

const SMOKE_PREFIX = "VT-IH14";

export type ModerationStripeSmokeCaseSeed = {
  caseId: string;
  reportId: string;
  subjectId: string;
  reporterId: string;
};

function readEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function createE2eAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env for E2E admin client");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasModerationStripeSmokeEnv(): boolean {
  return Boolean(
    hasStripeReconcileEnv() &&
      readEnv("E2E_ADMIN_EMAIL") &&
      readEnv("E2E_ADMIN_PASSWORD"),
  );
}

type RefundEligibilityPayload = {
  eligible?: boolean;
  ineligibleReason?: string;
  orderKind?: string;
};

function parseRefundEligibility(data: unknown): RefundEligibilityPayload | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const row = data as Record<string, unknown>;
  return {
    eligible: row.eligible === true,
    ineligibleReason:
      typeof row.ineligibleReason === "string"
        ? row.ineligibleReason
        : typeof row.ineligible_reason === "string"
          ? row.ineligible_reason
          : undefined,
    orderKind:
      typeof row.orderKind === "string"
        ? row.orderKind
        : typeof row.order_kind === "string"
          ? row.order_kind
          : undefined,
  };
}

export async function assertOrderRefundEligible(orderId: string): Promise<void> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin.rpc("fn_moderation_order_refund_eligible", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`[assertOrderRefundEligible] ${error.message}`);
  }

  const payload = parseRefundEligibility(data);
  expect(payload?.eligible, payload?.ineligibleReason ?? "not eligible").toBe(true);
  expect(payload?.orderKind).toBe("merchant_direct");
}

export async function getMerchantOrderNumber(orderId: string): Promise<string> {
  const admin = createE2eAdminClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderNumber] ${error.message}`);
  }

  const orderNumber = data?.order_number?.trim();
  expect(orderNumber, `missing order_number for ${orderId}`).toBeTruthy();
  return orderNumber!;
}

export async function assertCaseBundleHasEligibleRefundOrder(
  caseId: string,
  orderId: string,
): Promise<void> {
  const admin = createE2eAdminClient();

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, context_id, context_type")
    .eq("case_id", caseId)
    .eq("context_id", orderId)
    .maybeSingle();

  if (reportError) {
    throw new Error(`[assertCaseBundleHasEligibleRefundOrder:report] ${reportError.message}`);
  }

  expect(report, `case ${caseId} missing merchant_order report for ${orderId}`).toBeTruthy();
  expect(report?.context_type).toBe("merchant_order");

  await assertOrderRefundEligible(orderId);
}

export async function advanceOrderToModerationRefundEligible(params: {
  orderId: string;
  sellerId: string;
  buyerEmail: string;
  buyerPassword: string;
}): Promise<MerchantOrderReconcileSnapshot> {
  await waitForMerchantOrderPaymentHeld(params.orderId);

  await submitMerchantDirectFulfillment({
    orderId: params.orderId,
    sellerId: params.sellerId,
  });

  const shipped = await getMerchantOrderReconcileSnapshot(params.orderId);
  expect(shipped?.escrow_status).toBe("shipped");

  await confirmMerchantBuyerReceipt({
    orderId: params.orderId,
    buyerEmail: params.buyerEmail,
    buyerPassword: params.buyerPassword,
  });

  const held = await expect
    .poll(async () => {
      const row = await getMerchantOrderReconcileSnapshot(params.orderId);
      if (!row) {
        return null;
      }
      if (
        row.payout_status !== "held" ||
        !row.buyer_confirmed_at ||
        !row.payout_hold_until
      ) {
        return null;
      }
      const holdUntil = new Date(row.payout_hold_until).getTime();
      if (!Number.isFinite(holdUntil) || holdUntil <= Date.now()) {
        return null;
      }
      return row;
    })
    .toBeTruthy()
    .then(async () => getMerchantOrderReconcileSnapshot(params.orderId));

  expect(held).toBeTruthy();

  await expect
    .poll(async () => {
      try {
        await assertOrderRefundEligible(params.orderId);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);

  return held!;
}

export async function wipeModerationCaseForSubject(subjectId: string): Promise<void> {
  const admin = createE2eAdminClient();

  const { data: cases, error: caseSelectError } = await admin
    .from("moderation_cases")
    .select("id")
    .eq("subject_user_id", subjectId);

  if (caseSelectError) {
    throw new Error(`[wipeModerationCaseForSubject:cases] ${caseSelectError.message}`);
  }

  const caseIds = (cases ?? []).map((row) => row.id).filter(Boolean);
  if (caseIds.length > 0) {
    const { error: reportError } = await admin
      .from("reports")
      .delete()
      .in("case_id", caseIds);
    if (reportError) {
      throw new Error(`[wipeModerationCaseForSubject:reports] ${reportError.message}`);
    }
  }

  const { error: caseDeleteError } = await admin
    .from("moderation_cases")
    .delete()
    .eq("subject_user_id", subjectId);

  if (caseDeleteError) {
    throw new Error(`[wipeModerationCaseForSubject] ${caseDeleteError.message}`);
  }
}

export async function seedModerationCaseForStripeSmoke(params: {
  orderId: string;
  merchantId: string;
  buyerId: string;
  runId: string;
}): Promise<ModerationStripeSmokeCaseSeed> {
  await wipeModerationCaseForSubject(params.merchantId);

  const admin = createE2eAdminClient();
  const caseNumber = `${SMOKE_PREFIX}-${params.runId}`;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.merchantId,
      status: "open",
      primary_category: "fraud",
      auto_score: 20,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[seedModerationCaseForStripeSmoke:case] ${caseError.message}`);
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      reporter_id: params.buyerId,
      target_id: params.merchantId,
      target_type: "user",
      category: "fraud",
      source: "profile",
      status: "pending",
      reason: `${SMOKE_PREFIX} stripe smoke`,
      details: "I-H14 moderation refund smoke",
      context_type: "merchant_order",
      context_id: params.orderId,
      case_id: moderationCase.id,
      contribution_score: 20,
    })
    .select("id")
    .single();

  if (reportError) {
    throw new Error(`[seedModerationCaseForStripeSmoke:report] ${reportError.message}`);
  }

  return {
    caseId: moderationCase.id,
    reportId: report.id,
    subjectId: params.merchantId,
    reporterId: params.buyerId,
  };
}

export async function assertModerationRefundTerminal(orderId: string): Promise<void> {
  const admin = createE2eAdminClient();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("merchant_orders")
          .select("refund_status, escrow_status, stripe_refund_id")
          .eq("id", orderId)
          .maybeSingle();

        if (error) {
          throw new Error(`[assertModerationRefundTerminal] ${error.message}`);
        }

        if (!data) {
          return null;
        }

        if (
          data.refund_status !== "refunded" ||
          data.escrow_status !== "refunded" ||
          !data.stripe_refund_id?.trim()
        ) {
          return null;
        }

        return data;
      },
      { timeout: 90_000 },
    )
    .toBeTruthy();
}

export async function assertStripeRefundForOrder(orderId: string): Promise<void> {
  const snapshot = await getMerchantOrderReconcileSnapshot(orderId);
  const refundId = (
    await createE2eAdminClient()
      .from("merchant_orders")
      .select("stripe_refund_id, buyer_total_amount")
      .eq("id", orderId)
      .maybeSingle()
  ).data;

  expect(refundId?.stripe_refund_id).toBeTruthy();

  const stripe = createE2eStripeClient();
  const refund = await stripe.refunds.retrieve(refundId!.stripe_refund_id!);
  expect(refund.status).toBe("succeeded");

  const buyerTotal = refundId?.buyer_total_amount ?? snapshot?.buyer_total_amount;
  if (buyerTotal != null && refund.amount != null) {
    const expectedCents = Math.round(Number(buyerTotal) * 100);
    expect(refund.amount).toBe(expectedCents);
  }
}

export function getModerationStripeSmokeBuyerCreds(): {
  buyerEmail: string;
  buyerPassword: string;
} {
  const fixtures = getMerchantProductDetailFixtures();
  const buyerEmail = fixtures.buyerEmail;
  const buyerPassword = fixtures.buyerPassword;
  if (!buyerEmail || !buyerPassword) {
    throw new Error("Missing E2E_BUYER_EMAIL or E2E_BUYER_PASSWORD");
  }
  return { buyerEmail, buyerPassword };
}

export async function cleanupModerationStripeSmokeCase(
  subjectId: string,
): Promise<void> {
  await wipeModerationCaseForSubject(subjectId);
}
