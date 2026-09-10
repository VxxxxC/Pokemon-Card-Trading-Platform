import { NextResponse } from "next/server";
import { isCurrentUserAdmin } from "@/lib/auth/require-admin";
import {
  isFormDataImageUpload,
  resolveImageContentType,
  validateImageUpload,
} from "@/lib/listings/image-files";
import {
  isBunnyStorageConfigured,
  uploadAnnouncementPosterToBunny,
} from "@/lib/storage/bunny";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    if (!isBunnyStorageConfigured()) {
      return NextResponse.json(
        { success: false, error: "圖片儲存服務暫時無法使用，請稍後再試" },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "請先登入" },
        { status: 401 },
      );
    }

    const isAdmin = await isCurrentUserAdmin(supabase, user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "無管理員權限" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const entry = formData.get("image");
    const announcementId = String(formData.get("announcementId") ?? "").trim();

    if (!announcementId) {
      return NextResponse.json(
        { success: false, error: "缺少公告 ID" },
        { status: 400 },
      );
    }

    if (!entry || !isFormDataImageUpload(entry)) {
      return NextResponse.json(
        { success: false, error: "請選擇要上載的圖片" },
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

    const validationError = validateImageUpload({
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
    const bunnyUpload = await uploadAnnouncementPosterToBunny(
      announcementId,
      bytes,
      contentType,
    );

    return NextResponse.json({
      success: true,
      data: bunnyUpload,
    });
  } catch (error) {
    console.error("[admin/upload-announcement-image]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error && error.message.includes("Bunny")
            ? "圖片儲存服務暫時無法使用，請稍後再試"
            : "公告封面上載失敗，請稍後再試",
      },
      { status: 500 },
    );
  }
}
