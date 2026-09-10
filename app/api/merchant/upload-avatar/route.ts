import { NextResponse } from "next/server";
import {
  isFormDataImageUpload,
  resolveImageContentType,
  validateImageUpload,
} from "@/lib/listings/image-files";
import { requireActiveApiUser } from "@/lib/auth/require-active-api-user";
import { uploadMerchantShopAvatarToBunny } from "@/lib/storage/bunny";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

type MerchantRoleRow = Pick<Tables<"profiles">, "role">;

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
      .maybeSingle<MerchantRoleRow>();

    if (profileError || !profile || profile.role !== "merchant") {
      return NextResponse.json(
        { success: false, error: "無商戶權限" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const entry = formData.get("image");

    if (!entry || !isFormDataImageUpload(entry)) {
      return NextResponse.json(
        { success: false, error: "請選擇要上載的相片" },
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

    const upload = {
      blob: entry,
      name: entry.name || "shop-avatar.jpg",
      contentType,
    };
    const validationError = validateImageUpload({
      size: upload.blob.size,
      type: upload.contentType,
      name: upload.name,
    });

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await upload.blob.arrayBuffer());
    const bunnyUpload = await uploadMerchantShopAvatarToBunny(
      user.id,
      bytes,
      upload.contentType,
    );

    return NextResponse.json({
      success: true,
      data: bunnyUpload,
    });
  } catch (error) {
    console.error("[merchant/upload-avatar]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error && error.message.includes("Bunny")
            ? "圖片儲存服務暫時無法使用，請稍後再試"
            : "店舖頭像上載失敗，請稍後再試",
      },
      { status: 500 },
    );
  }
}
