import {
  resolveImageContentType,
  type ImageUploadLike,
} from "@/lib/listings/image-files";

export const REPORT_EVIDENCE_MAX_COUNT = 3;
export const REPORT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

export function validateReportEvidenceUpload(file: ImageUploadLike): string | null {
  const contentType = resolveImageContentType(file);
  if (!contentType) {
    return "只支援 JPG、PNG、WEBP、HEIC 格式";
  }

  if (file.size <= 0) {
    return "圖片檔案無效";
  }

  if (file.size > REPORT_EVIDENCE_MAX_BYTES) {
    return "單張證據圖片不可超過 5MB";
  }

  return null;
}
