/**
 * Merchant KYC 文件類型契約 — client-safe（無 server-only 依賴）。
 * Storage 讀寫請用 lib/storage/kyc-documents.ts（server-only）。
 */

export const KYC_DOCUMENT_TYPES = [
  "br_certificate",
  "bank_statement",
  "rep_id_front",
  "rep_id_back",
] as const;

export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const KYC_DOCUMENT_TYPE_LABELS: Record<KycDocumentType, string> = {
  br_certificate: "商業登記證 (BR)",
  bank_statement: "公司銀行結單",
  rep_id_front: "代表人身份證（正面）",
  rep_id_back: "代表人身份證（背面）",
};

export function isKycDocumentType(value: string): value is KycDocumentType {
  return (KYC_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export const KYC_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB，對齊 bucket file_size_limit

export const KYC_ACCEPTED_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type KycUploadLike = {
  size: number;
  type?: string;
  name?: string;
};

/** 解析上傳檔案的 content type；不支援時回 null。 */
export function resolveKycDocumentContentType(
  file: KycUploadLike,
): string | null {
  const mime = file.type?.toLowerCase() ?? "";
  if (mime in KYC_ACCEPTED_MIME_TO_EXT) {
    return mime;
  }
  if (mime === "image/jpg") {
    return "image/jpeg";
  }

  const extension = file.name?.split(".").pop()?.toLowerCase();
  if (extension && EXTENSION_TO_MIME[extension]) {
    return EXTENSION_TO_MIME[extension];
  }

  return null;
}

/** 驗證 KYC 上傳檔案；有問題回傳用戶可讀錯誤訊息，否則 null。 */
export function validateKycDocumentUpload(file: KycUploadLike): string | null {
  if (file.size <= 0) {
    return "檔案無效，請重新選擇";
  }
  if (!resolveKycDocumentContentType(file)) {
    return "只支援 PDF、JPG、PNG、WEBP 格式";
  }
  if (file.size > KYC_DOCUMENT_MAX_BYTES) {
    return "單一檔案不可超過 10MB";
  }
  return null;
}
