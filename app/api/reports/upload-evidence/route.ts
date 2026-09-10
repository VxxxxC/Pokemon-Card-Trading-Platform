import { NextResponse } from "next/server";
import {
  isFormDataImageUpload,
  resolveImageContentType,
} from "@/lib/listings/image-files";
import {
  REPORT_EVIDENCE_MAX_COUNT,
  validateReportEvidenceUpload,
} from "@/lib/moderation/report-evidence-files";
import {
  isBunnyStorageConfigured,
  uploadReportEvidenceToBunny,
} from "@/lib/storage/bunny";
import { requireActiveApiUser } from "@/lib/auth/require-active-api-user";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/supabase";

export async function POST(request: Request) {
  try {
    if (!isBunnyStorageConfigured()) {
      return NextResponse.json(
        { success: false, error: "證據上傳服務尚未設定" },
        { status: 503 },
      );
    }

    const auth = await requireActiveApiUser();
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }
    const user = auth.user;

    const supabase = await createClient();

    const { count: pendingCount, error: countError } = await supabase
      .from("report_attachments")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", user.id)
      .is("report_id", null);

    if (countError) {
      console.error("[reports/upload-evidence] count", countError.message);
      return NextResponse.json(
        { success: false, error: "無法驗證待提交證據數量" },
        { status: 500 },
      );
    }

    if ((pendingCount ?? 0) >= REPORT_EVIDENCE_MAX_COUNT) {
      return NextResponse.json(
        { success: false, error: `證據圖片不可超過 ${REPORT_EVIDENCE_MAX_COUNT} 張` },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const entry = formData.get("image");

    if (!entry || !isFormDataImageUpload(entry)) {
      return NextResponse.json(
        { success: false, error: "請選擇要上載的證據圖片" },
        { status: 400 },
      );
    }

    const contentType = resolveImageContentType({
      size: entry.size,
      type: entry.type,
      name: entry.name,
    });

    if (!contentType) {
      return NextResponse.json(
        { success: false, error: "圖片格式不支援，請使用 JPG、PNG、WEBP 或 HEIC" },
        { status: 400 },
      );
    }

    const validationError = validateReportEvidenceUpload({
      size: entry.size,
      type: contentType,
      name: entry.name,
    });

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await entry.arrayBuffer());
    const bunnyUpload = await uploadReportEvidenceToBunny(
      user.id,
      bytes,
      contentType,
    );

    const insertRow: TablesInsert<"report_attachments"> = {
      reporter_id: user.id,
      report_id: null,
      storage_path: bunnyUpload.objectKey,
      mime_type: contentType,
      byte_size: entry.size,
    };

    const { data, error } = await supabase
      .from("report_attachments")
      .insert([insertRow] as never)
      .select("id")
      .single<{ id: string }>();

    if (error || !data?.id) {
      console.error("[reports/upload-evidence] insert", error?.message);
      return NextResponse.json(
        { success: false, error: "證據圖片儲存失敗，請稍後再試" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        attachmentId: data.id,
        publicUrl: bunnyUpload.cdnUrl,
      },
    });
  } catch (error) {
    console.error("[reports/upload-evidence]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error && error.message.includes("Bunny")
            ? "證據圖片上傳失敗，請稍後再試"
            : "證據圖片上傳時發生錯誤",
      },
      { status: 500 },
    );
  }
}
