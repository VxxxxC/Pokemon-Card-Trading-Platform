/**
 * Merchant KYC 申請表欄位契約 + 驗證。
 * Server action 與 client wizard 共用。
 * 出款銀行戶口改由 Stripe onboarding 收集；平台只收公司/代表人資料 + 4 份文件。
 */

export type MerchantKycFields = {
  // 公司
  companyNameEn: string;
  companyNameZh: string;
  brNumber: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyPhone: string;
  // 代表人
  repNameEn: string;
  repNameZh: string;
  repDob: string; // YYYY-MM-DD
  repHkid: string;
  repAddressLine1: string;
  repAddressLine2: string;
  repEmail: string;
  repPhone: string;
  repTitle: string;
  // 文件 storage paths（經 /api/kyc/upload-document 取得）
  docBrCertificate: string;
  docBankStatement: string;
  docRepIdFront: string;
  docRepIdBack: string;
};

export type MerchantKycFormErrors = Partial<
  Record<keyof MerchantKycFields | "form", string>
>;

export type MerchantKycStep = 1 | 2 | 3;

export const MERCHANT_KYC_STEPS: {
  step: MerchantKycStep;
  title: string;
  description: string;
}[] = [
  {
    step: 1,
    title: "公司資料",
    description: "香港公司商業登記及聯絡資料",
  },
  {
    step: 2,
    title: "代表人資料",
    description: "董事／授權代表人身份資料",
  },
  {
    step: 3,
    title: "證明文件",
    description: "上傳 BR、銀行結單及身份證明",
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s-]{8,15}$/;
const HKID_RE = /^[A-Za-z]{1,2}[0-9]{6}\(?[0-9Aa]\)?$/;

function required(
  errors: MerchantKycFormErrors,
  fields: MerchantKycFields,
  key: keyof MerchantKycFields,
  message: string,
) {
  if (!fields[key].trim()) {
    errors[key] = message;
  }
}

function validateCompanyFields(fields: MerchantKycFields): MerchantKycFormErrors {
  const errors: MerchantKycFormErrors = {};

  required(errors, fields, "companyNameEn", "請輸入公司英文法定名稱");
  required(errors, fields, "brNumber", "請輸入商業登記號碼");
  if (!errors.brNumber && fields.brNumber.trim().length < 8) {
    errors.brNumber = "請輸入有效的商業登記號碼（至少 8 位）";
  }
  required(errors, fields, "companyAddressLine1", "請輸入公司註冊地址");
  required(errors, fields, "companyPhone", "請輸入公司電話");
  if (fields.companyPhone.trim() && !PHONE_RE.test(fields.companyPhone.trim())) {
    errors.companyPhone = "公司電話格式無效";
  }

  return errors;
}

function validateRepresentativeFields(
  fields: MerchantKycFields,
): MerchantKycFormErrors {
  const errors: MerchantKycFormErrors = {};

  required(errors, fields, "repNameEn", "請輸入代表人英文姓名");
  required(errors, fields, "repDob", "請輸入代表人出生日期");
  if (fields.repDob.trim()) {
    const dob = new Date(fields.repDob);
    const now = new Date();
    const age =
      (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dob.getTime()) || dob >= now) {
      errors.repDob = "出生日期無效";
    } else if (age < 18) {
      errors.repDob = "代表人必須年滿 18 歲";
    }
  }
  required(errors, fields, "repHkid", "請輸入代表人香港身份證號碼");
  if (fields.repHkid.trim() && !HKID_RE.test(fields.repHkid.trim())) {
    errors.repHkid = "身份證號碼格式無效（例：A123456(7)）";
  }
  required(errors, fields, "repAddressLine1", "請輸入代表人住宅地址");
  required(errors, fields, "repEmail", "請輸入代表人電郵");
  if (fields.repEmail.trim() && !EMAIL_RE.test(fields.repEmail.trim())) {
    errors.repEmail = "電郵格式無效";
  }
  required(errors, fields, "repPhone", "請輸入代表人電話");
  if (fields.repPhone.trim() && !PHONE_RE.test(fields.repPhone.trim())) {
    errors.repPhone = "代表人電話格式無效";
  }
  required(errors, fields, "repTitle", "請輸入代表人職位（例：Director）");

  return errors;
}

function validateDocumentFields(fields: MerchantKycFields): MerchantKycFormErrors {
  const errors: MerchantKycFormErrors = {};

  required(errors, fields, "docBrCertificate", "請上傳商業登記證 (BR)");
  required(errors, fields, "docBankStatement", "請上傳公司銀行結單");
  required(errors, fields, "docRepIdFront", "請上傳代表人身份證（正面）");
  required(errors, fields, "docRepIdBack", "請上傳代表人身份證（背面）");

  return errors;
}

/** Wizard 每步 client-side gate */
export function validateMerchantKycStep(
  step: MerchantKycStep,
  fields: MerchantKycFields,
): MerchantKycFormErrors {
  if (step === 1) return validateCompanyFields(fields);
  if (step === 2) return validateRepresentativeFields(fields);
  return validateDocumentFields(fields);
}

/** Server action 最終完整性 gate */
export function validateMerchantKycFields(
  fields: MerchantKycFields,
): MerchantKycFormErrors {
  return {
    ...validateCompanyFields(fields),
    ...validateRepresentativeFields(fields),
    ...validateDocumentFields(fields),
  };
}

export function parseMerchantKycFormData(
  formData: FormData,
): MerchantKycFields {
  const get = (key: string) =>
    ((formData.get(key) as string | null) ?? "").trim();

  return {
    companyNameEn: get("companyNameEn"),
    companyNameZh: get("companyNameZh"),
    brNumber: get("brNumber"),
    companyAddressLine1: get("companyAddressLine1"),
    companyAddressLine2: get("companyAddressLine2"),
    companyPhone: get("companyPhone"),
    repNameEn: get("repNameEn"),
    repNameZh: get("repNameZh"),
    repDob: get("repDob"),
    repHkid: get("repHkid"),
    repAddressLine1: get("repAddressLine1"),
    repAddressLine2: get("repAddressLine2"),
    repEmail: get("repEmail"),
    repPhone: get("repPhone"),
    repTitle: get("repTitle"),
    docBrCertificate: get("docBrCertificate"),
    docBankStatement: get("docBankStatement"),
    docRepIdFront: get("docRepIdFront"),
    docRepIdBack: get("docRepIdBack"),
  };
}
