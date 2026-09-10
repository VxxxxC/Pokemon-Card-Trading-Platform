import { randomUUID } from "crypto";
import {
  KYC_ACCEPTED_MIME_TO_EXT,
  type KycDocumentType,
} from "@/lib/kyc/documents";
import { createAdminClient } from "@/lib/supabase/admin";

export {
  isKycDocumentType,
  resolveKycDocumentContentType,
  validateKycDocumentUpload,
  type KycDocumentType,
} from "@/lib/kyc/documents";

/**
 * Merchant KYC 文件儲存 — Supabase Storage 私有 bucket `kyc-documents`。
 *
 * 安全模型：bucket 為 private 且無任何 storage.objects policy，
 * 所有讀寫一律經 service role（createAdminClient）於 server-side 進行；
 * 呼叫方（API route / server action）必須自行完成 auth + owner/admin 檢查。
 * 嚴禁 import 入任何 "use client" 元件。
 */

export const KYC_DOCUMENTS_BUCKET = "kyc-documents";

export function buildKycDocumentObjectPath(
  userId: string,
  documentType: KycDocumentType,
  contentType: string,
): string {
  const ext = KYC_ACCEPTED_MIME_TO_EXT[contentType] ?? "bin";
  return `${userId}/${documentType}/${randomUUID()}.${ext}`;
}

/** 驗證 storage path 屬於指定用戶（防止提交時引用他人檔案）。 */
export function isKycPathOwnedByUser(
  storagePath: string,
  userId: string,
): boolean {
  return storagePath.startsWith(`${userId}/`) && !storagePath.includes("..");
}

export type KycDocumentUploadResult = {
  storagePath: string;
};

export async function uploadKycDocumentToStorage(
  userId: string,
  documentType: KycDocumentType,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<KycDocumentUploadResult> {
  const admin = createAdminClient();
  const storagePath = buildKycDocumentObjectPath(
    userId,
    documentType,
    contentType,
  );

  const { error } = await admin.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .upload(storagePath, Buffer.from(fileBytes), {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`KYC document upload failed: ${error.message}`);
  }

  return { storagePath };
}

/** Admin 審核用短時效簽名 URL（預設 10 分鐘）。 */
export async function createKycDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 600,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `KYC signed URL failed: ${error?.message ?? "no url returned"}`,
    );
  }

  return data.signedUrl;
}

/** 下載文件 bytes（供 approve 後同步 Stripe Files API 使用）。 */
export async function downloadKycDocumentBytes(
  storagePath: string,
): Promise<Uint8Array> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(KYC_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `KYC document download failed: ${error?.message ?? "no data"}`,
    );
  }

  return new Uint8Array(await data.arrayBuffer());
}
