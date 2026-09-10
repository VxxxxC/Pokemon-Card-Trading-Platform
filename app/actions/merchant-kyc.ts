"use server";

import { revalidatePath } from "next/cache";
import type { Tables } from "@/types/supabase";
import {
  parseMerchantKycFormData,
  validateMerchantKycFields,
  type MerchantKycFormErrors,
} from "@/lib/kyc/validation";
import {
  isKycPathOwnedByUser,
  type KycDocumentType,
} from "@/lib/storage/kyc-documents";
import { getOptionalAuthUser } from "@/lib/auth/session";
import { requireActiveAuthUser } from "@/lib/auth/mutation-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueMerchantKycApplicationSubmittedEmail } from "@/lib/notifications/merchant-onboarding-emails";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Merchant KYC 申請 — member 端。
 *
 * kyc_applications / kyc_documents 為 RLS 全拒表（PII），
 * 所有讀寫經 service role 進行，action 層自行做 auth + owner 檢查，
 * 只回傳脫敏後嘅欄位俾 UI。
 */

type ProfileRoleRow = Pick<Tables<"profiles">, "role">;

export type KycApplicationStatus = "pending" | "approved" | "rejected";

export type MyKycApplication = {
  id: string;
  status: KycApplicationStatus;
  rejectReason: string | null;
  companyNameEn: string;
  companyNameZh: string | null;
  brNumber: string;
  submittedAt: string;
  uploadedDocumentTypes: KycDocumentType[];
};

export type GetMyKycApplicationResult =
  | { success: true; data: MyKycApplication | null }
  | { success: false; error: string };

export async function getMyKycApplication(): Promise<GetMyKycApplicationResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "未登入" };
  }

  const user = await getOptionalAuthUser();
  if (!user) {
    return { success: false, error: "請先登入" };
  }

  try {
    const admin = createAdminClient();
    const { data: application, error } = await admin
      .from("kyc_applications")
      .select(
        "id, status, reject_reason, company_name_en, company_name_zh, br_number, created_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[getMyKycApplication]", error.message);
      return { success: false, error: "無法載入申請資料，請稍後再試" };
    }

    if (!application) {
      return { success: true, data: null };
    }

    const { data: documents } = await admin
      .from("kyc_documents")
      .select("document_type")
      .eq("application_id", application.id);

    return {
      success: true,
      data: {
        id: application.id,
        status: application.status,
        rejectReason: application.reject_reason,
        companyNameEn: application.company_name_en,
        companyNameZh: application.company_name_zh,
        brNumber: application.br_number,
        submittedAt: application.created_at,
        uploadedDocumentTypes: (documents ?? []).map(
          (doc) => doc.document_type as KycDocumentType,
        ),
      },
    };
  } catch (error) {
    console.error("[getMyKycApplication]", error);
    return { success: false, error: "無法載入申請資料，請稍後再試" };
  }
}

const STORAGE_EXT_TO_CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function contentTypeFromStoragePath(storagePath: string): string {
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  return STORAGE_EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream";
}

/**
 * 提交商戶 KYC 申請（useActionState form action）。
 * 完整性驗證做 gate：全欄位 + 4 份文件缺一不可，
 * 確保 admin approve 時 call Stripe API 資料已齊。
 * 成功回傳 null；rejected 申請重交會 reset 返 pending。
 */
export async function submitMerchantKycApplication(
  _prev: MerchantKycFormErrors | null,
  formData: FormData,
): Promise<MerchantKycFormErrors | null> {
  if (!isSupabaseConfigured()) {
    return { form: "未登入" };
  }

  const auth = await requireActiveAuthUser();
  if (!auth.ok) {
    return { form: auth.error };
  }
  const { user, supabase } = auth;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<ProfileRoleRow>();

  if (profileError || !profile) {
    return { form: "無法驗證帳戶，請稍後再試" };
  }

  if (profile.role === "merchant") {
    return { form: "您已是認證商戶，無需再次提交 KYC" };
  }

  const fields = parseMerchantKycFormData(formData);
  const errors = validateMerchantKycFields(fields);
  if (Object.keys(errors).length) {
    return errors;
  }

  const documentPaths: Record<KycDocumentType, string> = {
    br_certificate: fields.docBrCertificate,
    bank_statement: fields.docBankStatement,
    rep_id_front: fields.docRepIdFront,
    rep_id_back: fields.docRepIdBack,
  };

  for (const path of Object.values(documentPaths)) {
    if (!isKycPathOwnedByUser(path, user.id)) {
      return { form: "文件資料無效，請重新上傳" };
    }
  }

  try {
    const admin = createAdminClient();

    const applicationPayload = {
      company_name_en: fields.companyNameEn,
      company_name_zh: fields.companyNameZh || null,
      br_number: fields.brNumber,
      company_address: {
        line1: fields.companyAddressLine1,
        line2: fields.companyAddressLine2 || null,
        city: "Hong Kong",
      },
      company_phone: fields.companyPhone,
      rep_name_en: fields.repNameEn,
      rep_name_zh: fields.repNameZh || null,
      rep_dob: fields.repDob,
      rep_hkid: fields.repHkid,
      rep_address: {
        line1: fields.repAddressLine1,
        line2: fields.repAddressLine2 || null,
        city: "Hong Kong",
      },
      rep_email: fields.repEmail,
      rep_phone: fields.repPhone,
      rep_title: fields.repTitle,
    };

    const documentsPayload = (
      Object.entries(documentPaths) as [KycDocumentType, string][]
    ).map(([documentType, storagePath]) => ({
      document_type: documentType,
      storage_path: storagePath,
      content_type: contentTypeFromStoragePath(storagePath),
    }));

    const { error: rpcError } = await admin.rpc(
      "rpc_submit_merchant_kyc_application",
      {
        p_user_id: user.id,
        p_application: applicationPayload,
        p_documents: documentsPayload,
      },
    );

    if (rpcError) {
      console.error("[submitMerchantKycApplication]", rpcError.message);
      return { form: rpcError.message || "提交失敗，請稍後再試" };
    }
  } catch (error) {
    console.error("[submitMerchantKycApplication]", error);
    return { form: "提交失敗，請稍後再試" };
  }

  revalidatePath("/profile/user/merchant-apply");
  revalidatePath("/profile/user");
  revalidatePath("/profile/merchant");
  await enqueueMerchantKycApplicationSubmittedEmail(user.id);
  return null;
}
