import type { ReportCategorySlug } from "@/lib/moderation/category-config";
import {
  findMemberListingForIntegration,
  findMerchantListingForIntegration,
  seedMemberListingForIntegration,
} from "../../rewards/helpers/checkout-fixture";
import { createServiceRoleClient } from "../../shared/supabase-admin";
import { MATRIX_PREFIX } from "./fixtures";

export type PhaseHMerchantOrderSeed = {
  orderId: string;
  listingId: string;
  merchantId: string;
};

export type PhaseHMemberOrderSeed = {
  orderId: string;
  listingId: string;
  sellerId: string;
};

export async function seedMerchantDirectRefundEligibleOrder(params: {
  buyerId: string;
  runId: string;
  suffix?: string;
}): Promise<PhaseHMerchantOrderSeed> {
  const admin = createServiceRoleClient();
  const { listingId, sellerId: merchantId } = await findMerchantListingForIntegration();

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_merchant_direct_refund_eligible_order",
    {
      p_listing_id: listingId,
      p_buyer_id: params.buyerId,
      p_payment_intent_suffix: params.suffix ?? params.runId,
    },
  );

  if (seedError || !orderId) {
    throw new Error(
      `[seedMerchantDirectRefundEligibleOrder] ${seedError?.message ?? "missing order id"}`,
    );
  }

  return { orderId, listingId, merchantId };
}

export async function seedMerchantAuthRefundEligibleOrder(params: {
  buyerId: string;
  runId: string;
  suffix?: string;
}): Promise<PhaseHMerchantOrderSeed> {
  const admin = createServiceRoleClient();
  const { listingId, sellerId: merchantId } = await findMerchantListingForIntegration();

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_merchant_auth_refund_eligible_order",
    {
      p_listing_id: listingId,
      p_buyer_id: params.buyerId,
      p_payment_intent_suffix: params.suffix ?? params.runId,
    },
  );

  if (seedError || !orderId) {
    throw new Error(
      `[seedMerchantAuthRefundEligibleOrder] ${seedError?.message ?? "missing order id"}`,
    );
  }

  return { orderId, listingId, merchantId };
}

export async function seedMemberAuthRefundEligibleOrder(params: {
  buyerId: string;
  runId: string;
  suffix?: string;
}): Promise<PhaseHMemberOrderSeed> {
  const admin = createServiceRoleClient();
  const envSellerId = process.env.E2E_SELLER_ID?.trim();
  let sellerId =
    envSellerId && envSellerId !== params.buyerId
      ? envSellerId
      : null;

  if (!sellerId) {
    const fixture = await findMemberListingForIntegration({
      excludeBuyerId: params.buyerId,
    });
    sellerId = fixture.sellerId;
  }

  if (sellerId === params.buyerId) {
    throw new Error(
      "[seedMemberAuthRefundEligibleOrder] member listing seller must differ from buyer",
    );
  }

  const listingId = await seedMemberListingForIntegration(sellerId);

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_member_auth_refund_eligible_order",
    {
      p_listing_id: listingId,
      p_buyer_id: params.buyerId,
      p_payment_intent_suffix: params.suffix ?? params.runId,
    },
  );

  if (seedError || !orderId) {
    throw new Error(
      `[seedMemberAuthRefundEligibleOrder] ${seedError?.message ?? "missing order id"}`,
    );
  }

  return { orderId, listingId, sellerId };
}

export async function seedMemberP2pMeetupOrder(params: {
  buyerId: string;
  sellerId: string;
  listingId: string;
  runId: string;
  suffix: string;
}): Promise<string> {
  const admin = createServiceRoleClient();
  const orderNumber = `E2E-P2P-${params.runId}-${params.suffix}`;

  const { data, error } = await admin
    .from("member_orders")
    .insert({
      buyer_id: params.buyerId,
      seller_id: params.sellerId,
      listing_id: params.listingId,
      final_price: 100,
      total_amount: 100,
      buyer_total_amount: 100,
      use_authentication: false,
      status: "completed",
      escrow_status: "released",
      payment_capture_status: "fully_captured",
      refund_status: "none",
      seller_payout_status: "ready",
      seller_settlement_status: "cleared",
      order_number: orderNumber,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      extended_count: 0,
      auth_fee: 0,
      inbound_shipping_fee: 0,
      outbound_shipping_fee: 0,
      platform_subsidy_amount: 0,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(
      `[seedMemberP2pMeetupOrder] ${error?.message ?? "missing order id"}`,
    );
  }

  return data.id;
}

export async function seedModerationCaseWithMerchantOrderContext(params: {
  reporterId: string;
  subjectId: string;
  orderId: string;
  runId: string;
  suffix: string;
  category?: ReportCategorySlug;
}): Promise<{ caseId: string; reportId: string }> {
  const admin = createServiceRoleClient();
  const caseNumber = `VT-PH-${params.runId}-${params.suffix}`;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.subjectId,
      status: "open",
      primary_category: params.category ?? "fraud",
      auto_score: 20,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[seedModerationCaseWithMerchantOrderContext:case] ${caseError.message}`);
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      reporter_id: params.reporterId,
      target_id: params.subjectId,
      target_type: "user",
      category: params.category ?? "fraud",
      source: "profile",
      status: "pending",
      reason: `${MATRIX_PREFIX} phase-h ${params.suffix}`,
      details: "phase-h refund fixture",
      context_type: "merchant_order",
      context_id: params.orderId,
      case_id: moderationCase.id,
      contribution_score: 20,
    })
    .select("id")
    .single();

  if (reportError) {
    throw new Error(`[seedModerationCaseWithMerchantOrderContext:report] ${reportError.message}`);
  }

  return { caseId: moderationCase.id, reportId: report.id };
}

export async function seedModerationCaseWithMemberOrderContext(params: {
  reporterId: string;
  subjectId: string;
  orderId: string;
  runId: string;
  suffix: string;
  category?: ReportCategorySlug;
}): Promise<{ caseId: string; reportId: string }> {
  const admin = createServiceRoleClient();
  const caseNumber = `VT-PH-${params.runId}-${params.suffix}`;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.subjectId,
      status: "open",
      primary_category: params.category ?? "fraud",
      auto_score: 20,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[seedModerationCaseWithMemberOrderContext:case] ${caseError.message}`);
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      reporter_id: params.reporterId,
      target_id: params.subjectId,
      target_type: "user",
      category: params.category ?? "fraud",
      source: "profile",
      status: "pending",
      reason: `${MATRIX_PREFIX} phase-h ${params.suffix}`,
      details: "phase-h refund fixture",
      context_type: "member_order",
      context_id: params.orderId,
      case_id: moderationCase.id,
      contribution_score: 20,
    })
    .select("id")
    .single();

  if (reportError) {
    throw new Error(`[seedModerationCaseWithMemberOrderContext:report] ${reportError.message}`);
  }

  return { caseId: moderationCase.id, reportId: report.id };
}

export async function assertModerationOrderRefundEligible(
  orderId: string,
  expectedKind: "merchant_direct" | "merchant_auth" | "member_auth",
): Promise<void> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin.rpc("fn_moderation_order_refund_eligible", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`[assertModerationOrderRefundEligible] ${error.message}`);
  }

  const row = data as { eligible?: boolean; orderKind?: string; ineligibleReason?: string };
  if (!row?.eligible) {
    throw new Error(
      `[assertModerationOrderRefundEligible] ineligible: ${row?.ineligibleReason ?? "unknown"}`,
    );
  }

  if (row.orderKind !== expectedKind) {
    throw new Error(
      `[assertModerationOrderRefundEligible] expected ${expectedKind}, got ${row.orderKind}`,
    );
  }
}

export async function getMerchantOrderRefundStatus(
  orderId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("merchant_orders")
    .select("refund_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMerchantOrderRefundStatus] ${error.message}`);
  }

  return data?.refund_status ?? null;
}

export async function getMemberOrderRefundStatus(
  orderId: string,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("member_orders")
    .select("refund_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`[getMemberOrderRefundStatus] ${error.message}`);
  }

  return data?.refund_status ?? null;
}

export async function countSanctionsForCase(caseId: string): Promise<number> {
  const admin = createServiceRoleClient();
  const { count, error } = await admin
    .from("account_sanctions")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId);

  if (error) {
    throw new Error(`[countSanctionsForCase] ${error.message}`);
  }

  return count ?? 0;
}
