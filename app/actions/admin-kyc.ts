"use server";

import { revalidatePath } from "next/cache";
import type { KycDocumentType } from "@/lib/kyc/documents";
import {
  createExpressAccountForKycApplication,
  createRepresentativePersonForKycApplication,
  markCompanyOwnersProvided,
  syncKycDocumentsToStripe,
} from "@/lib/stripe/connect-kyc";
import { isStripeConnectAccountId } from "@/lib/stripe/sync-kyc-connect-flags";
import {
  getStripeAccountPayoutSummary,
  type StripeAccountPayoutSummary,
} from "@/lib/stripe/account-summary";
import { createKycDocumentSignedUrl } from "@/lib/storage/kyc-documents";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";
import {
  enqueueMerchantKycApprovedEmail,
  enqueueMerchantKycRejectedEmail,
} from "@/lib/notifications/merchant-onboarding-emails";

/**
 * Admin 商戶 KYC 審核。
 *
 * kyc_applications / kyc_documents 為 RLS 全拒表，讀寫經 service role；
 * 每個 action 先以 cookie session 驗證 admin 身份（fail-closed）。
 *
 * Approve pipeline：
 * 1. kyc_applications → approved
 * 2. profiles.role → merchant
 * 3. kyc_records upsert verified（trigger 自動開 merchant_shops）
 * 4. Stripe：建 Express account（全量 prefill）→ 回寫 stripe_account_id
 *    → 建代表人 person → 推送 4 份文件
 * Stripe 步驟失敗唔 rollback 平台審批，錯誤回傳俾 admin UI 顯示；
 * merchant 端 onboarding CTA 可重試補建。
 */

type KycApplicationRow = Tables<"kyc_applications">;

async function requireAdmin(): Promise<
  { ok: true; adminId: string } | { ok: false; error: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { ok: false, error: "請先登入" };
  }

  const supabase = await createClient();
  const isAdmin = await isCurrentUserAdmin(supabase, user.id);
  if (!isAdmin) {
    return { ok: false, error: "無管理員權限" };
  }

  return { ok: true, adminId: user.id };
}

export type AdminKycApplicationListItem = {
  id: string;
  userId: string;
  applicantDisplayName: string;
  applicantUsername: string | null;
  shopHandle: string | null;
  status: "pending" | "approved" | "rejected";
  companyNameEn: string;
  companyNameZh: string | null;
  brNumber: string;
  companyPhone: string;
  repNameEn: string;
  repEmail: string;
  repPhone: string;
  repTitle: string;
  rejectReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  stripeAccountId: string | null;
  documents: {
    id: string;
    documentType: KycDocumentType;
    stripeFileId: string | null;
  }[];
};

export type ListKycApplicationsResult =
  | { success: true; data: AdminKycApplicationListItem[] }
  | { success: false; error: string };

export async function listKycApplications(params: {
  status?: "pending" | "approved" | "rejected";
}): Promise<ListKycApplicationsResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const admin = createAdminClient();

    let query = admin
      .from("kyc_applications")
      .select(
        `id, user_id, status, company_name_en, company_name_zh, br_number,
         company_phone, rep_name_en, rep_email, rep_phone, rep_title,
         reject_reason, created_at, reviewed_at,
         kyc_documents ( id, document_type, stripe_file_id )`,
      )
      .order("created_at", { ascending: false });

    if (params.status) {
      query = query.eq("status", params.status);
    }

    const { data: applications, error } = await query;

    if (error) {
      console.error("[listKycApplications]", error.message);
      return { success: false, error: "無法載入 KYC 申請列表" };
    }

    const userIds = (applications ?? []).map((app) => app.user_id);

    const [{ data: profiles }, { data: kycRecords }, { data: shops }] =
      await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id, display_name, username").in("id", userIds)
        : Promise.resolve({
            data: [] as { id: string; display_name: string; username: string | null }[],
          }),
      userIds.length
        ? admin
            .from("kyc_records")
            .select("merchant_id, stripe_account_id")
            .in("merchant_id", userIds)
        : Promise.resolve({
            data: [] as { merchant_id: string; stripe_account_id: string | null }[],
          }),
      userIds.length
        ? admin
            .from("merchant_shops")
            .select("merchant_id, shop_handle")
            .in("merchant_id", userIds)
        : Promise.resolve({
            data: [] as { merchant_id: string; shop_handle: string | null }[],
          }),
    ]);

    const displayNameById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.display_name]),
    );
    const usernameById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.username]),
    );
    const shopHandleByUserId = new Map(
      (shops ?? []).map((shop) => [shop.merchant_id, shop.shop_handle]),
    );
    const stripeAccountByUserId = new Map(
      (kycRecords ?? []).map((record) => [
        record.merchant_id,
        record.stripe_account_id,
      ]),
    );

    return {
      success: true,
      data: (applications ?? []).map((app) => ({
        id: app.id,
        userId: app.user_id,
        applicantDisplayName: displayNameById.get(app.user_id) ?? "—",
        applicantUsername: usernameById.get(app.user_id) ?? null,
        shopHandle: shopHandleByUserId.get(app.user_id) ?? null,
        status: app.status,
        companyNameEn: app.company_name_en,
        companyNameZh: app.company_name_zh,
        brNumber: app.br_number,
        companyPhone: app.company_phone,
        repNameEn: app.rep_name_en,
        repEmail: app.rep_email,
        repPhone: app.rep_phone,
        repTitle: app.rep_title,
        rejectReason: app.reject_reason,
        submittedAt: app.created_at,
        reviewedAt: app.reviewed_at,
        stripeAccountId: stripeAccountByUserId.get(app.user_id) ?? null,
        documents: (app.kyc_documents ?? []).map((doc) => ({
          id: doc.id,
          documentType: doc.document_type as KycDocumentType,
          stripeFileId: doc.stripe_file_id,
        })),
      })),
    };
  } catch (error) {
    console.error("[listKycApplications]", error);
    return { success: false, error: "無法載入 KYC 申請列表" };
  }
}

export type GetKycDocumentSignedUrlResult =
  | { success: true; data: { url: string } }
  | { success: false; error: string };

export type GetStripePayoutBankSummaryResult =
  | { success: true; data: StripeAccountPayoutSummary }
  | { success: false; error: string };

export async function getStripePayoutBankSummary(
  applicationId: string,
): Promise<GetStripePayoutBankSummaryResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const admin = createAdminClient();

    const { data: application, error: loadError } = await admin
      .from("kyc_applications")
      .select("id, user_id, status")
      .eq("id", applicationId)
      .maybeSingle();

    if (loadError || !application) {
      return { success: false, error: "找不到該申請" };
    }

    if (application.status !== "approved") {
      return { success: false, error: "僅已批准申請可查閱 Stripe 出款資料" };
    }

    const { data: kycRecord, error: recordError } = await admin
      .from("kyc_records")
      .select("stripe_account_id")
      .eq("merchant_id", application.user_id)
      .maybeSingle();

    if (recordError) {
      console.error("[getStripePayoutBankSummary]", recordError.message);
      return { success: false, error: "無法載入 Stripe 帳戶資料" };
    }

    const stripeAccountId = kycRecord?.stripe_account_id?.trim();
    if (!stripeAccountId) {
      return { success: false, error: "尚未建立 Stripe 帳戶" };
    }

    const summary = await getStripeAccountPayoutSummary(stripeAccountId);
    return { success: true, data: summary };
  } catch (error) {
    console.error("[getStripePayoutBankSummary]", error);
    return { success: false, error: "無法載入 Stripe 出款資料，請稍後再試" };
  }
}

export async function getKycDocumentSignedUrl(
  documentId: string,
): Promise<GetKycDocumentSignedUrlResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const admin = createAdminClient();
    const { data: document, error } = await admin
      .from("kyc_documents")
      .select("storage_path")
      .eq("id", documentId)
      .maybeSingle();

    if (error || !document) {
      return { success: false, error: "找不到該文件" };
    }

    const url = await createKycDocumentSignedUrl(document.storage_path);
    return { success: true, data: { url } };
  } catch (error) {
    console.error("[getKycDocumentSignedUrl]", error);
    return { success: false, error: "無法產生文件連結，請稍後再試" };
  }
}

export type ReviewKycApplicationResult =
  | {
      success: true;
      data: {
        decision: "approve" | "reject";
        stripeAccountId?: string;
        /** Stripe 同步失敗時的提示（平台審批已生效，可由 merchant CTA 重試） */
        stripeSyncWarning?: string;
      };
    }
  | { success: false; error: string };

async function runStripeProvisioning(
  application: KycApplicationRow,
): Promise<{ stripeAccountId?: string; warning?: string }> {
  const admin = createAdminClient();

  let stripeAccountId: string;
  try {
    const account = await createExpressAccountForKycApplication(application);
    stripeAccountId = account.id;
  } catch (error) {
    console.error("[reviewKycApplication] stripe account create", error);
    return {
      warning:
        "Stripe 帳戶建立失敗，商戶可稍後於後台重試連接 Stripe。",
    };
  }

  const { error: recordError } = await admin
    .from("kyc_records")
    .update({ stripe_account_id: stripeAccountId })
    .eq("merchant_id", application.user_id);

  if (recordError) {
    console.error("[reviewKycApplication] stripe_account_id 回寫", recordError.message);
  }

  try {
    const person = await createRepresentativePersonForKycApplication(
      stripeAccountId,
      application,
    );

    await markCompanyOwnersProvided(stripeAccountId);

    const { data: documents } = await admin
      .from("kyc_documents")
      .select("*")
      .eq("application_id", application.id);

    if (documents?.length) {
      const { fileIds } = await syncKycDocumentsToStripe(
        stripeAccountId,
        person.id,
        documents,
      );

      await Promise.all(
        (Object.entries(fileIds) as [KycDocumentType, string][]).map(
          ([documentType, fileId]) =>
            admin
              .from("kyc_documents")
              .update({ stripe_file_id: fileId })
              .eq("application_id", application.id)
              .eq("document_type", documentType),
        ),
      );
    }
  } catch (error) {
    console.error("[reviewKycApplication] stripe document sync", error);
    return {
      stripeAccountId,
      warning:
        "Stripe 帳戶已建立，但文件同步失敗；商戶完成 onboarding 時或需補交文件。",
    };
  }

  return { stripeAccountId };
}

async function rollbackFailedApproval(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: string,
  userId: string,
): Promise<void> {
  await admin
    .from("kyc_applications")
    .update({
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", applicationId);

  await admin.from("profiles").update({ role: "member" }).eq("id", userId);
}

async function upsertVerifiedKycRecord(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  verifiedAt: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from("kyc_records").upsert(
    {
      merchant_id: merchantId,
      kyc_status: "verified",
      verified_at: verifiedAt,
    },
    { onConflict: "merchant_id" },
  );

  if (error) {
    console.error("[upsertVerifiedKycRecord]", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export type RetryKycProvisioningResult =
  | {
      success: true;
      data: {
        stripeAccountId?: string;
        stripeSyncWarning?: string;
      };
    }
  | { success: false; error: string };

export async function retryKycProvisioning(
  applicationId: string,
): Promise<RetryKycProvisioningResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  try {
    const admin = createAdminClient();

    const { data: application, error: loadError } = await admin
      .from("kyc_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (loadError || !application) {
      return { success: false, error: "找不到該申請" };
    }

    if (application.status !== "approved") {
      return { success: false, error: "僅可重試已批准的申請" };
    }

    const { data: kycRecord } = await admin
      .from("kyc_records")
      .select("merchant_id, stripe_account_id")
      .eq("merchant_id", application.user_id)
      .maybeSingle();

    if (isStripeConnectAccountId(kycRecord?.stripe_account_id)) {
      return {
        success: false,
        error: "該商戶已有 Stripe 帳戶，無需重試",
      };
    }

    const verifiedAt = application.reviewed_at ?? new Date().toISOString();
    const kycUpsert = await upsertVerifiedKycRecord(
      admin,
      application.user_id,
      verifiedAt,
    );

    if (!kycUpsert.ok) {
      return { success: false, error: "KYC 狀態更新失敗，請稍後再試" };
    }

    const { stripeAccountId, warning } = await runStripeProvisioning(application);

    revalidatePath("/admin/merchants");
    revalidatePath("/profile/merchant");

    return {
      success: true,
      data: {
        stripeAccountId,
        stripeSyncWarning: warning,
      },
    };
  } catch (error) {
    console.error("[retryKycProvisioning]", error);
    return { success: false, error: "重試失敗，請稍後再試" };
  }
}

export async function reviewKycApplication(
  applicationId: string,
  decision: "approve" | "reject",
  rejectReason?: string,
): Promise<ReviewKycApplicationResult> {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }

  if (decision === "reject" && !rejectReason?.trim()) {
    return { success: false, error: "請填寫拒絕原因" };
  }

  try {
    const admin = createAdminClient();

    const { data: application, error: loadError } = await admin
      .from("kyc_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle();

    if (loadError || !application) {
      return { success: false, error: "找不到該申請" };
    }

    if (application.status !== "pending") {
      return { success: false, error: "該申請已完成審核" };
    }

    const reviewedAt = new Date().toISOString();

    if (decision === "reject") {
      const { error } = await admin
        .from("kyc_applications")
        .update({
          status: "rejected",
          reject_reason: rejectReason!.trim(),
          reviewed_by: guard.adminId,
          reviewed_at: reviewedAt,
        })
        .eq("id", applicationId);

      if (error) {
        console.error("[reviewKycApplication] reject", error.message);
        return { success: false, error: "更新失敗，請稍後再試" };
      }

      const { error: roleError } = await admin
        .from("profiles")
        .update({ role: "member" })
        .eq("id", application.user_id);

      if (roleError) {
        console.error("[reviewKycApplication] reject role rollback", roleError.message);
      }

      const { error: kycError } = await admin
        .from("kyc_records")
        .update({ kyc_status: "rejected", verified_at: null })
        .eq("merchant_id", application.user_id);

      if (kycError) {
        console.error("[reviewKycApplication] reject kyc rollback", kycError.message);
      }

      revalidatePath("/admin/merchants");
      revalidatePath("/profile/user/merchant-apply");
      revalidatePath("/profile/user");
      revalidatePath("/profile/merchant");
      await enqueueMerchantKycRejectedEmail({
        userId: application.user_id,
        rejectReason: rejectReason!.trim(),
      });
      return { success: true, data: { decision: "reject" } };
    }

    // ── Approve pipeline ──
    const { error: approveError } = await admin
      .from("kyc_applications")
      .update({
        status: "approved",
        reject_reason: null,
        reviewed_by: guard.adminId,
        reviewed_at: reviewedAt,
      })
      .eq("id", applicationId);

    if (approveError) {
      console.error("[reviewKycApplication] approve", approveError.message);
      return { success: false, error: "更新失敗，請稍後再試" };
    }

    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: "merchant" })
      .eq("id", application.user_id);

    if (roleError) {
      console.error("[reviewKycApplication] role upgrade", roleError.message);
      return { success: false, error: "角色升級失敗，請稍後再試" };
    }

    // upsert kyc_records verified → 觸發 trg_kyc_verified_init_shop 自動開店
    const kycUpsert = await upsertVerifiedKycRecord(
      admin,
      application.user_id,
      reviewedAt,
    );

    if (!kycUpsert.ok) {
      await rollbackFailedApproval(admin, applicationId, application.user_id);
      return { success: false, error: "KYC 狀態更新失敗，請稍後再試" };
    }

    const { stripeAccountId, warning } = await runStripeProvisioning(
      application,
    );

    revalidatePath("/admin/merchants");
    revalidatePath("/profile/user/merchant-apply");
    revalidatePath("/profile/merchant");

    await enqueueMerchantKycApprovedEmail(application.user_id);

    return {
      success: true,
      data: {
        decision: "approve",
        stripeAccountId,
        stripeSyncWarning: warning,
      },
    };
  } catch (error) {
    console.error("[reviewKycApplication]", error);
    return { success: false, error: "審核操作失敗，請稍後再試" };
  }
}
