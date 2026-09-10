import type { ReportCategorySlug } from "@/lib/moderation/category-config";
import { createServiceRoleClient } from "../../shared/supabase-admin";
import { MATRIX_PREFIX } from "./fixtures";

export type MatrixMemberListingSeed = {
  listingId: string;
  productId: string;
};

async function resolveProductIdForSeller(sellerId: string): Promise<string> {
  const admin = createServiceRoleClient();
  const envListingId = process.env.E2E_LISTING_ID?.trim();

  if (envListingId) {
    const { data: envListing, error: envError } = await admin
      .from("listings")
      .select("product_id, seller_id")
      .eq("id", envListingId)
      .maybeSingle();

    if (envError) {
      throw new Error(`[resolveProductIdForSeller] ${envError.message}`);
    }

    if (envListing?.product_id && envListing.seller_id === sellerId) {
      return envListing.product_id;
    }
  }

  const { data, error } = await admin
    .from("listings")
    .select("product_id")
    .eq("seller_id", sellerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[resolveProductIdForSeller] ${error.message}`);
  }

  if (!data?.product_id) {
    throw new Error(
      `[resolveProductIdForSeller] No listing product found for seller ${sellerId}`,
    );
  }

  return data.product_id;
}

export async function seedMatrixMemberListingForSeller(
  sellerId: string,
  runId: string,
  suffix: string,
): Promise<MatrixMemberListingSeed> {
  const admin = createServiceRoleClient();
  const productId = await resolveProductIdForSeller(sellerId);

  const { data, error } = await admin
    .from("listings")
    .insert({
      seller_id: sellerId,
      product_id: productId,
      price: 100,
      status: "active",
      seller_persona: "member",
      grading_company: "RAW",
      seller_description: `${MATRIX_PREFIX} listing ${runId} ${suffix}`,
      images: [],
      use_authentication: false,
    })
    .select("id, product_id")
    .single();

  if (error) {
    throw new Error(`[seedMatrixMemberListingForSeller] ${error.message}`);
  }

  return {
    listingId: data.id,
    productId: data.product_id,
  };
}

export async function seedMemberOrderWithPayoutReady(params: {
  buyerId: string;
  sellerId: string;
  listingId: string;
}): Promise<string> {
  const admin = createServiceRoleClient();

  const { data: orderId, error: seedError } = await admin.rpc(
    "rpc_e2e_seed_member_auth_pending_payment_order",
    {
      p_listing_id: params.listingId,
      p_buyer_id: params.buyerId,
    },
  );

  if (seedError) {
    throw new Error(`[seedMemberOrderWithPayoutReady] ${seedError.message}`);
  }

  if (!orderId) {
    throw new Error("[seedMemberOrderWithPayoutReady] missing order id");
  }

  const { error: payoutError } = await admin
    .from("member_orders")
    .update({ seller_payout_status: "ready" })
    .eq("id", orderId);

  if (payoutError) {
    throw new Error(`[seedMemberOrderWithPayoutReady:payout] ${payoutError.message}`);
  }

  return orderId;
}

export async function seedInsufficientEvidenceCase(params: {
  reporterId: string;
  subjectId: string;
  runId: string;
  suffix: string;
  category: Extract<ReportCategorySlug, "harassment" | "offline_trade">;
}): Promise<{ caseId: string; reportId: string }> {
  const admin = createServiceRoleClient();
  const caseNumber = `VT-INSUFF-${params.runId}-${params.suffix}`;

  const { data: moderationCase, error: caseError } = await admin
    .from("moderation_cases")
    .insert({
      case_number: caseNumber,
      subject_user_id: params.subjectId,
      status: "open",
      primary_category: params.category,
      auto_score: 15,
      admin_adjustment: 0,
    })
    .select("id")
    .single();

  if (caseError) {
    throw new Error(`[seedInsufficientEvidenceCase:case] ${caseError.message}`);
  }

  const { data: report, error: reportError } = await admin
    .from("reports")
    .insert({
      reporter_id: params.reporterId,
      target_id: params.subjectId,
      target_type: "user",
      reason: `${MATRIX_PREFIX} insufficient evidence ${params.suffix}`,
      status: "pending",
      category: params.category,
      case_id: moderationCase.id,
      source: "profile",
      contribution_score: 15,
    })
    .select("id")
    .single();

  if (reportError) {
    await admin.from("moderation_cases").delete().eq("id", moderationCase.id);
    throw new Error(`[seedInsufficientEvidenceCase:report] ${reportError.message}`);
  }

  return { caseId: moderationCase.id, reportId: report.id };
}

const EXPIRED_SANCTION_ENDS_AT_ISO = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

export async function expireSanctionForCase(
  caseId: string,
  type: "suspend" | "ban" = "suspend",
): Promise<void> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("account_sanctions")
    .update({ ends_at: EXPIRED_SANCTION_ENDS_AT_ISO() })
    .eq("case_id", caseId)
    .eq("type", type)
    .select("id");

  if (error) {
    throw new Error(`[expireSanctionForCase] ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(
      `[expireSanctionForCase] no ${type} sanction updated for case ${caseId}`,
    );
  }
}

export async function expireAccountAccessSanctionsForUser(
  userId: string,
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("account_sanctions")
    .update({ ends_at: EXPIRED_SANCTION_ENDS_AT_ISO() })
    .eq("user_id", userId)
    .in("type", ["suspend", "ban"])
    .is("revoked_at", null);

  if (error) {
    throw new Error(`[expireAccountAccessSanctionsForUser] ${error.message}`);
  }
}
