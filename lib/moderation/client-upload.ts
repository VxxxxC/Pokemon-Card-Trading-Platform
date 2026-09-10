import { resolveImageContentType } from "@/lib/listings/image-files";
import { validateReportEvidenceUpload } from "@/lib/moderation/report-evidence-files";

type UploadReportEvidenceApiResponse =
  | { success: true; data: { attachmentId: string; publicUrl: string } }
  | { success: false; error: string };

export async function uploadReportEvidence(
  file: File,
): Promise<{ attachmentId: string; publicUrl: string }> {
  const contentType = resolveImageContentType(file);
  if (!contentType) {
    throw new Error("圖片格式不支援，請使用 JPG、PNG、WEBP 或 HEIC");
  }

  const validationError = validateReportEvidenceUpload({
    size: file.size,
    type: contentType,
    name: file.name,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const body = new FormData();
  body.append("image", file, file.name || `report-evidence-${Date.now()}.jpg`);

  const response = await fetch("/api/reports/upload-evidence", {
    method: "POST",
    body,
  });

  const payload = (await response.json()) as UploadReportEvidenceApiResponse;

  if (!response.ok || !payload.success) {
    throw new Error(
      payload.success === false
        ? payload.error
        : `證據圖片上傳失敗 (${response.status})`,
    );
  }

  return payload.data;
}
