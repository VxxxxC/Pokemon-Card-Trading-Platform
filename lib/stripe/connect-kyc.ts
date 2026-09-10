import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import type { KycDocumentType } from "@/lib/kyc/documents";
import { downloadKycDocumentBytes } from "@/lib/storage/kyc-documents";
import type { Tables } from "@/types/supabase";

/**
 * Stripe Connect Express（HK company）KYC 同步 helpers。
 *
 * 平台申請表已一次過收齊 Stripe 全部必要資料，approve 後：
 * 1. accounts.create 全量 prefill company / business_profile（出款銀行由 hosted onboarding 收集）
 * 2. persons.create prefill 代表人資料
 * 3. files.create 推送 BR / 銀行結單 / 身份證，掛到對應 verification 位
 * 剩低嘅 hosted onboarding link 理想情況只需確認資料 + 接受 Stripe ToS。
 */

type KycApplicationRow = Tables<"kyc_applications">;
type KycDocumentRow = Tables<"kyc_documents">;

type AddressJson = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
};

function parseAddress(value: unknown): AddressJson {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AddressJson;
  }
  return {};
}

function toStripeAddress(value: unknown): Stripe.AddressParam {
  const address = parseAddress(value);
  return {
    line1: address.line1 ?? undefined,
    line2: address.line2 ?? undefined,
    city: address.city ?? "Hong Kong",
    country: "HK",
  };
}

/** HK 英文姓名慣例「姓氏在前」（CHAN Tai Man）→ Stripe first/last name。 */
function splitRepName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: parts[0]! };
  }
  return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
}

function toStripeDob(dob: string): { day: number; month: number; year: number } {
  const [year, month, day] = dob.split("-").map((part) => Number(part));
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** MCC 5947 — Gift, Card, Novelty & Souvenir Shops（trading cards 零售） */
const TRADING_CARDS_MCC = "5947";

/** 平台 KYC 收集單一代表人；Stripe HK company 要求申報 UBO 股權。 */
const REPRESENTATIVE_PERCENT_OWNERSHIP = 100;

export async function createExpressAccountForKycApplication(
  application: KycApplicationRow,
): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: "express",
    country: "HK",
    email: application.rep_email,
    business_type: "company",
    company: {
      name: application.company_name_en,
      phone: application.company_phone,
      address: toStripeAddress(application.company_address),
      registration_number: application.br_number,
    },
    business_profile: {
      mcc: TRADING_CARDS_MCC,
      product_description: "Trading card sales (Pokemon TCG) on HKCardVault",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    // 出款銀行戶口改由 merchant 完成 Stripe hosted onboarding 時收集
    metadata: {
      hkcv_user_id: application.user_id,
      hkcv_kyc_application_id: application.id,
    },
  });
}

export async function createRepresentativePersonForKycApplication(
  stripeAccountId: string,
  application: KycApplicationRow,
): Promise<Stripe.Person> {
  const { firstName, lastName } = splitRepName(application.rep_name_en);

  return stripe.accounts.createPerson(stripeAccountId, {
    first_name: firstName,
    last_name: lastName,
    dob: toStripeDob(application.rep_dob),
    id_number: application.rep_hkid.replace(/[()]/g, ""),
    address: toStripeAddress(application.rep_address),
    email: application.rep_email,
    phone: application.rep_phone,
    relationship: {
      representative: true,
      director: true,
      executive: true,
      owner: true,
      percent_ownership: REPRESENTATIVE_PERCENT_OWNERSHIP,
      title: application.rep_title,
    },
  });
}

/** 單一 100% UBO 代表人建立後，告知 Stripe 所有 owner 已提供。 */
export async function markCompanyOwnersProvided(
  stripeAccountId: string,
): Promise<void> {
  await stripe.accounts.update(stripeAccountId, {
    company: { owners_provided: true },
  });
}

export type StripeFileSyncResult = {
  /** documentType → Stripe file id */
  fileIds: Partial<Record<KycDocumentType, string>>;
};

async function uploadKycFileToStripe(
  stripeAccountId: string,
  document: KycDocumentRow,
  purpose: Stripe.FileCreateParams.Purpose,
): Promise<string> {
  const bytes = await downloadKycDocumentBytes(document.storage_path);
  const fileName = document.storage_path.split("/").pop() ?? "document";

  const file = await stripe.files.create(
    {
      purpose,
      file: {
        data: Buffer.from(bytes),
        name: fileName,
        type: document.content_type,
      },
    },
    { stripeAccount: stripeAccountId },
  );

  return file.id;
}

/**
 * 將平台已儲存嘅 KYC 文件推送去 Stripe 並掛到對應 verification 位：
 * - BR 證書 → company verification document
 * - 身份證正/背面 → 代表人 person verification document
 * - 銀行結單 → 上傳留底（Stripe 需要時可經 dashboard / onboarding 引用）
 */
export async function syncKycDocumentsToStripe(
  stripeAccountId: string,
  personId: string,
  documents: KycDocumentRow[],
): Promise<StripeFileSyncResult> {
  const fileIds: Partial<Record<KycDocumentType, string>> = {};

  const byType = new Map(
    documents.map((doc) => [doc.document_type as KycDocumentType, doc]),
  );

  const brCertificate = byType.get("br_certificate");
  if (brCertificate) {
    const fileId = await uploadKycFileToStripe(
      stripeAccountId,
      brCertificate,
      "account_requirement",
    );
    fileIds.br_certificate = fileId;
    await stripe.accounts.update(stripeAccountId, {
      documents: {
        proof_of_registration: { files: [fileId] },
      },
    });
  }

  const bankStatement = byType.get("bank_statement");
  if (bankStatement) {
    const fileId = await uploadKycFileToStripe(
      stripeAccountId,
      bankStatement,
      "account_requirement",
    );
    fileIds.bank_statement = fileId;
    await stripe.accounts.update(stripeAccountId, {
      documents: {
        bank_account_ownership_verification: { files: [fileId] },
      },
    });
  }

  const idFront = byType.get("rep_id_front");
  const idBack = byType.get("rep_id_back");
  const idFrontFileId = idFront
    ? await uploadKycFileToStripe(stripeAccountId, idFront, "identity_document")
    : null;
  const idBackFileId = idBack
    ? await uploadKycFileToStripe(stripeAccountId, idBack, "identity_document")
    : null;

  if (idFrontFileId) fileIds.rep_id_front = idFrontFileId;
  if (idBackFileId) fileIds.rep_id_back = idBackFileId;

  if (idFrontFileId || idBackFileId) {
    await stripe.accounts.updatePerson(stripeAccountId, personId, {
      verification: {
        document: {
          front: idFrontFileId ?? undefined,
          back: idBackFileId ?? undefined,
        },
      },
    });
  }

  return { fileIds };
}
