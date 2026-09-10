import { resolveImageContentType } from "@/lib/listings/image-files";

type UploadAnnouncementImageApiResponse =
  | { success: true; data: { objectKey: string; cdnUrl: string } }
  | { success: false; error: string };

export async function uploadAnnouncementPosterImage(
  file: File,
  announcementId: string,
): Promise<{ objectKey: string; cdnUrl: string }> {
  const contentType = resolveImageContentType(file);
  if (!contentType) {
    throw new Error("圖片格式不支援，請使用 JPG、PNG、WEBP 或 HEIC");
  }

  const body = new FormData();
  body.append("image", file, file.name || `announcement-${Date.now()}.jpg`);
  body.append("announcementId", announcementId);

  const response = await fetch("/api/admin/upload-announcement-image", {
    method: "POST",
    body,
  });

  const payload = (await response.json()) as UploadAnnouncementImageApiResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      payload.success ? `圖片上載失敗 (${response.status})` : payload.error,
    );
  }

  return payload.data;
}
