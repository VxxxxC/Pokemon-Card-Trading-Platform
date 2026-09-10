import { NextResponse } from "next/server";
import {
  isKycDocumentType,
  resolveKycDocumentContentType,
  uploadKycDocumentToStorage,
  validateKycDocumentUpload,
} from "@/lib/storage/kyc-documents";
import { requireActiveApiUser } from "@/lib/auth/require-active-api-user";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type ProfileRoleRow = Pick<Tables<"profiles">, "role">;

/**
 * Merchant KYC 文件上傳。
 * 檔案存入私有 bucket `kyc-documents`（{userId}/{documentType}/{uuid}.{ext}），
 * 回傳 storagePath 俾申請表提交時寫入 kyc_documents。
 */
export async function POST(request: Request) {
  try {
    const auth = await requireActiveApiUser();
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user;

    const supabase = await createClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<ProfileRoleRow>();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "無法驗證帳戶，請稍後再試" },
        { status: 403 },
      );
    }

    if (profile.role === "merchant") {
      return NextResponse.json(
        { success: false, error: "您已是認證商戶，無需再次提交 KYC" },
        { status: 403 },
      );
    }

    const formData = await request.formData();

    const documentTypeRaw = formData.get("documentType");
    if (
      typeof documentTypeRaw !== "string" ||
      !isKycDocumentType(documentTypeRaw)
    ) {
      return NextResponse.json(
        { success: false, error: "文件類型無效" },
        { status: 400 },
      );
    }

    const entry = formData.get("document");
    if (!(entry instanceof File) || entry.size <= 0) {
      return NextResponse.json(
        { success: false, error: "請選擇要上傳的文件" },
        { status: 400 },
      );
    }

    const validationError = validateKycDocumentUpload({
      size: entry.size,
      type: entry.type,
      name: entry.name,
    });

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    const contentType = resolveKycDocumentContentType({
      size: entry.size,
      type: entry.type,
      name: entry.name,
    });

    if (!contentType) {
      return NextResponse.json(
        { success: false, error: "只支援 PDF、JPG、PNG、WEBP 格式" },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await entry.arrayBuffer());
    const upload = await uploadKycDocumentToStorage(
      user.id,
      documentTypeRaw,
      bytes,
      contentType,
    );

    return NextResponse.json({
      success: true,
      data: {
        storagePath: upload.storagePath,
        documentType: documentTypeRaw,
        contentType,
      },
    });
  } catch (error) {
    console.error("[kyc/upload-document]", error);
    return NextResponse.json(
      { success: false, error: "文件上傳失敗，請稍後再試" },
      { status: 500 },
    );
  }
}
