"use client";

// name 屬性為 backend 合約（lib/kyc/validation.ts），不可改動。

import { useRef, useState, useActionState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  submitMerchantKycApplication,
  type MyKycApplication,
} from "@/app/actions/merchant-kyc";
import {
  KYC_DOCUMENT_TYPE_LABELS,
  KYC_DOCUMENT_TYPES,
  validateKycDocumentUpload,
  type KycDocumentType,
} from "@/lib/kyc/documents";
import {
  MERCHANT_KYC_STEPS,
  parseMerchantKycFormData,
  validateMerchantKycStep,
  type MerchantKycFormErrors,
  type MerchantKycStep,
} from "@/lib/kyc/validation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DocumentUploadState = {
  storagePath: string;
  fileName: string;
};

const DOC_FIELD_NAME: Record<KycDocumentType, string> = {
  br_certificate: "docBrCertificate",
  bank_statement: "docBankStatement",
  rep_id_front: "docRepIdFront",
  rep_id_back: "docRepIdBack",
};

const formCardClass =
  "bg-bg-card border border-[rgba(237,232,224,0.08)] shadow-none ring-0 [--card-spacing:--spacing(3)] sm:[--card-spacing:--spacing(3.5)] gap-2.5 sm:gap-3";
const formCardHeaderClass =
  "gap-0 pb-2.5 sm:pb-3 border-b border-[rgba(237,232,224,0.06)]";
const formCardFooterClass =
  "flex gap-2.5 sm:gap-3 border-t border-[rgba(237,232,224,0.08)] bg-bg-page/30 pt-3 mt-1";
const formCardContentClass = "space-y-3 sm:space-y-3.5";
const UPLOAD_FORMAT_HINT = "PDF / JPG / PNG / WEBP，每份 10MB 內";
const primaryBtnClass =
  "flex-1 min-w-0 h-10 bg-brand hover:bg-brand-hover text-[#17130f] font-sans font-bold text-[13px] border-0 shadow-[0_4px_14px_rgba(212,165,116,0.18)]";
const primaryBtnFullClass =
  "w-full sm:w-auto min-w-[128px] h-10 bg-brand hover:bg-brand-hover text-[#17130f] font-sans font-bold text-[13px] border-0 shadow-[0_4px_14px_rgba(212,165,116,0.18)]";
const outlineBtnClass =
  "shrink-0 h-10 px-4 w-auto min-w-[96px] border-[rgba(237,232,224,0.12)] bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary";

function FormFieldGrid({
  children,
  className,
  twoColMobile = false,
}: {
  children: ReactNode;
  className?: string;
  twoColMobile?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2.5 sm:gap-3",
        twoColMobile ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

function FormSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2.5", className)}>
      <h3 className="font-sans text-[11px] font-semibold text-brand/85">
        {title}
      </h3>
      <div className="space-y-2.5 sm:space-y-3">{children}</div>
    </section>
  );
}

function FormCardHeader({
  step,
  title,
  description,
}: {
  step: MerchantKycStep;
  title: string;
  description: string;
}) {
  return (
    <CardHeader className={formCardHeaderClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="font-sans text-[15px] sm:text-[17px] text-text-primary leading-snug">
            {title}
          </CardTitle>
          <CardDescription className="text-[11px] sm:text-[12px] text-text-disabled leading-relaxed">
            {description}
          </CardDescription>
        </div>
        <StepBadge step={step} />
      </div>
    </CardHeader>
  );
}

function StepBadge({ step }: { step: MerchantKycStep }) {
  return (
    <span
      className="inline-flex items-center rounded-md border border-brand/25 bg-brand/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand"
    >
      步驟 {step}/3
    </span>
  );
}

function fieldClass(hasError: boolean, type?: string): string {
  return cn(
    "w-full h-9 sm:h-10 px-3 sm:px-3.5 rounded-lg bg-bg-page/60 font-sans text-[13px] text-text-primary placeholder:text-text-disabled border outline-none transition-shadow",
    type === "date" &&
      "input-date-theme",
    hasError
      ? "border-warning focus:ring-2 focus:ring-[rgba(239,68,68,0.30)]"
      : "border-[rgba(237,232,224,0.12)] focus:ring-2 focus:ring-[rgba(140,115,85,0.40)] focus:border-[rgba(212,165,116,0.40)]",
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 font-sans text-[12px] text-warning">{message}</p>;
}

function TextField({
  label,
  name,
  type = "text",
  placeholder,
  required = true,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block font-sans text-[11px] sm:text-[12px] font-medium text-text-secondary leading-snug">
        {label}
        {required ? (
          <span className="text-text-disabled"> *</span>
        ) : null}
      </label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        className={fieldClass(!!error, type)}
      />
      <FieldError message={error} />
    </div>
  );
}

function MerchantApplyStepper({ currentStep }: { currentStep: MerchantKycStep }) {
  return (
    <nav aria-label="商戶入駐步驟" className="space-y-2">
      <p className="font-mono text-[10px] text-text-disabled tabular-nums">
        步驟 {currentStep}/{MERCHANT_KYC_STEPS.length}
      </p>
      <div
        className="h-1 rounded-full bg-[rgba(237,232,224,0.08)] overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300"
          style={{
            width: `${(currentStep / MERCHANT_KYC_STEPS.length) * 100}%`,
          }}
        />
      </div>
    </nav>
  );
}

function DocumentUploadField({
  documentType,
  uploaded,
  uploading,
  uploadError,
  fieldError,
  onFileSelected,
}: {
  documentType: KycDocumentType;
  uploaded: DocumentUploadState | null;
  uploading: boolean;
  uploadError: string | null;
  fieldError?: string;
  onFileSelected: (file: File) => void;
}) {
  const label = KYC_DOCUMENT_TYPE_LABELS[documentType];
  const message = uploadError ?? fieldError;
  const isDone = Boolean(uploaded) && !uploading;

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 space-y-2 transition-colors",
        isDone
          ? "border-success/30 bg-[rgba(16,185,129,0.06)]"
          : "border-[rgba(237,232,224,0.12)] bg-bg-page/35",
        message && "border-warning/35",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-[11px] sm:text-[12px] font-medium text-text-primary leading-snug">
          {label}
          <span className="text-text-disabled"> *</span>
        </p>
        {isDone ? (
          <span className="shrink-0 rounded border border-success/25 bg-success/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-success">
            已上傳
          </span>
        ) : null}
      </div>

      <label
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-md border border-dashed px-2.5 py-2 transition-colors",
          uploading
            ? "pointer-events-none border-[rgba(237,232,224,0.12)] opacity-60"
            : "cursor-pointer border-[rgba(237,232,224,0.14)] hover:border-brand/35 hover:bg-brand/5",
        )}
      >
        <Upload className="size-3.5 shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 truncate font-sans text-[11px] text-text-secondary">
          {uploading
            ? "上傳中…"
            : isDone
              ? uploaded!.fileName
              : "點擊選擇檔案"}
        </span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={uploading}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
          }}
        />
      </label>

      <input
        type="hidden"
        name={DOC_FIELD_NAME[documentType]}
        value={uploaded?.storagePath ?? ""}
      />
      <FieldError message={message} />
    </div>
  );
}

function StatusCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-2xl mx-auto w-full">
      <Card className="bg-bg-card border-[rgba(212,165,116,0.20)]">
        <CardHeader>
          <CardTitle className="font-sans text-[20px] text-text-primary">
            {title}
          </CardTitle>
          <CardDescription className="text-text-secondary">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export function MerchantApplyClient({
  initialApplication,
}: {
  initialApplication: MyKycApplication | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [currentStep, setCurrentStep] = useState<MerchantKycStep>(1);
  const [stepErrors, setStepErrors] = useState<MerchantKycFormErrors | null>(
    null,
  );

  const [documents, setDocuments] = useState<
    Partial<Record<KycDocumentType, DocumentUploadState>>
  >({});
  const [uploadingTypes, setUploadingTypes] = useState<Set<KycDocumentType>>(
    new Set(),
  );
  const [uploadErrors, setUploadErrors] = useState<
    Partial<Record<KycDocumentType, string>>
  >({});

  const [errors, formAction, isPending] = useActionState<
    MerchantKycFormErrors | null,
    FormData
  >(async (prev, formData) => {
    const result = await submitMerchantKycApplication(prev, formData);
    if (result === null) {
      router.push("/profile/merchant");
      router.refresh();
    }
    return result;
  }, null);

  const displayErrors = errors ?? stepErrors;

  if (initialApplication?.status === "pending") {
    return (
      <StatusCard
        title="商戶入駐申請 — 審核中"
        description={`公司：${initialApplication.companyNameEn}（BR：${initialApplication.brNumber}）`}
      >
        <p className="font-sans text-[14px] text-text-secondary leading-relaxed">
          您的申請已於{" "}
          {new Date(initialApplication.submittedAt).toLocaleDateString("zh-HK")}{" "}
          提交。平台管理員正在人工審核，通過後系統將自動為您開通商戶帳戶及 Stripe
          收款設定。
        </p>
        <Link
          href="/profile/merchant"
          className="inline-block mt-4 font-sans text-[14px] text-brand hover:underline"
        >
          前往商戶後台
        </Link>
        <Link
          href="/profile/user"
          className="inline-block mt-2 font-sans text-[13px] text-text-secondary hover:underline"
        >
          返回會員中心
        </Link>
      </StatusCard>
    );
  }

  if (initialApplication?.status === "approved") {
    return (
      <StatusCard
        title="商戶入駐申請 — 已批准"
        description="您的商戶帳戶已開通"
      >
        <Link
          href="/profile/merchant"
          className="inline-block font-sans text-[14px] text-brand hover:underline"
        >
          前往商戶後台
        </Link>
      </StatusCard>
    );
  }

  const isResubmission = initialApplication?.status === "rejected";

  async function handleUpload(documentType: KycDocumentType, file: File) {
    const clientError = validateKycDocumentUpload({
      size: file.size,
      type: file.type,
      name: file.name,
    });
    if (clientError) {
      setUploadErrors((prev) => ({ ...prev, [documentType]: clientError }));
      return;
    }

    setUploadErrors((prev) => ({ ...prev, [documentType]: undefined }));
    setUploadingTypes((prev) => new Set(prev).add(documentType));

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("documentType", documentType);
      uploadFormData.append("document", file);

      const response = await fetch("/api/kyc/upload-document", {
        method: "POST",
        body: uploadFormData,
      });
      const json = (await response.json()) as
        | { success: true; data: { storagePath: string } }
        | { success: false; error: string };

      if (!json.success) {
        setUploadErrors((prev) => ({ ...prev, [documentType]: json.error }));
        return;
      }

      setDocuments((prev) => ({
        ...prev,
        [documentType]: {
          storagePath: json.data.storagePath,
          fileName: file.name,
        },
      }));
    } catch {
      setUploadErrors((prev) => ({
        ...prev,
        [documentType]: "上傳失敗，請稍後再試",
      }));
    } finally {
      setUploadingTypes((prev) => {
        const next = new Set(prev);
        next.delete(documentType);
        return next;
      });
    }
  }

  function readFormFields() {
    if (!formRef.current) return null;
    return parseMerchantKycFormData(new FormData(formRef.current));
  }

  function handleNext() {
    const fields = readFormFields();
    if (!fields) return;

    const validationErrors = validateMerchantKycStep(currentStep, fields);
    if (Object.keys(validationErrors).length > 0) {
      setStepErrors(validationErrors);
      return;
    }

    setStepErrors(null);
    const nextStep = Math.min(currentStep + 1, 3) as MerchantKycStep;
    setCurrentStep(nextStep);
  }

  function handleBack() {
    setStepErrors(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1) as MerchantKycStep);
  }

  const activeStepMeta = MERCHANT_KYC_STEPS.find((s) => s.step === currentStep)!;
  const allDocumentsUploaded = KYC_DOCUMENT_TYPES.every(
    (type) => documents[type],
  );

  return (
    <div className="max-w-2xl mx-auto w-full space-y-5 animate-fadeIn">
      <div className="rounded-xl border border-[rgba(237,232,224,0.08)] bg-bg-card/40 px-3.5 py-3">
        <p className="font-sans text-[12px] sm:text-[13px] text-text-secondary leading-relaxed">
          請按步驟填寫香港公司資料及上傳證明文件。審批通過後，出款銀行帳戶將於
          Stripe 開戶時設定。
        </p>
      </div>

      {isResubmission && (
        <div className="rounded-xl border border-warning/30 bg-[rgba(239,68,68,0.08)] px-3.5 py-3">
          <p className="font-sans text-[13px] text-warning">
            上次申請未獲批准：{initialApplication?.rejectReason ?? "未提供原因"}
          </p>
          <p className="mt-1 font-sans text-[12px] text-text-secondary">
            請修正後重新提交。
          </p>
        </div>
      )}

      <MerchantApplyStepper currentStep={currentStep} />

      <form ref={formRef} action={formAction}>
        {/* Step 1 — 公司資料 */}
        <div className={cn(currentStep !== 1 && "hidden")}>
          <Card className={formCardClass}>
            <FormCardHeader
              step={1}
              title={activeStepMeta.title}
              description={activeStepMeta.description}
            />
            <CardContent className={formCardContentClass}>
              <FormSection title="公司名稱">
                <FormFieldGrid>
                  <TextField
                    label="公司英文法定名稱"
                    name="companyNameEn"
                    placeholder="ABC Trading Limited"
                    error={displayErrors?.companyNameEn}
                  />
                  <TextField
                    label="公司中文名稱"
                    name="companyNameZh"
                    required={false}
                    error={displayErrors?.companyNameZh}
                  />
                </FormFieldGrid>
              </FormSection>
              <FormSection title="登記及聯絡">
                <FormFieldGrid twoColMobile>
                  <TextField
                    label="商業登記號碼 (BR No.)"
                    name="brNumber"
                    placeholder="12345678-000"
                    error={displayErrors?.brNumber}
                  />
                  <TextField
                    label="公司電話"
                    name="companyPhone"
                    placeholder="+852 12345678"
                    error={displayErrors?.companyPhone}
                  />
                </FormFieldGrid>
              </FormSection>
              <FormSection title="註冊地址">
                <TextField
                  label="公司註冊地址（第一行）"
                  name="companyAddressLine1"
                  error={displayErrors?.companyAddressLine1}
                />
                <TextField
                  label="公司註冊地址（第二行）"
                  name="companyAddressLine2"
                  required={false}
                  error={displayErrors?.companyAddressLine2}
                />
              </FormSection>
            </CardContent>
            <CardFooter className={cn(formCardFooterClass, "justify-end")}>
              <Button type="button" onClick={handleNext} className={primaryBtnFullClass}>
                下一步
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Step 2 — 代表人資料 */}
        <div className={cn(currentStep !== 2 && "hidden")}>
          <Card className={formCardClass}>
            <FormCardHeader
              step={2}
              title={activeStepMeta.title}
              description={activeStepMeta.description}
            />
            <CardContent className={formCardContentClass}>
              <FormSection title="身份資料">
                <FormFieldGrid>
                  <TextField
                    label="代表人英文姓名"
                    name="repNameEn"
                    placeholder="CHAN Tai Man"
                    error={displayErrors?.repNameEn}
                  />
                  <TextField
                    label="代表人中文姓名"
                    name="repNameZh"
                    required={false}
                    error={displayErrors?.repNameZh}
                  />
                </FormFieldGrid>
                <FormFieldGrid twoColMobile>
                  <TextField
                    label="出生日期"
                    name="repDob"
                    type="date"
                    error={displayErrors?.repDob}
                  />
                  <TextField
                    label="香港身份證號碼"
                    name="repHkid"
                    placeholder="A123456(7)"
                    error={displayErrors?.repHkid}
                  />
                </FormFieldGrid>
              </FormSection>
              <FormSection title="住宅地址">
                <TextField
                  label="住宅地址（第一行）"
                  name="repAddressLine1"
                  error={displayErrors?.repAddressLine1}
                />
                <TextField
                  label="住宅地址（第二行）"
                  name="repAddressLine2"
                  required={false}
                  error={displayErrors?.repAddressLine2}
                />
              </FormSection>
              <FormSection title="聯絡資料">
                <FormFieldGrid twoColMobile>
                  <TextField
                    label="電郵"
                    name="repEmail"
                    type="email"
                    error={displayErrors?.repEmail}
                  />
                  <TextField
                    label="電話"
                    name="repPhone"
                    placeholder="+852 91234567"
                    error={displayErrors?.repPhone}
                  />
                </FormFieldGrid>
                <TextField
                  label="職位"
                  name="repTitle"
                  placeholder="Director"
                  error={displayErrors?.repTitle}
                />
              </FormSection>
            </CardContent>
            <CardFooter className={cn(formCardFooterClass, "justify-between")}>
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className={outlineBtnClass}
              >
                上一步
              </Button>
              <Button type="button" onClick={handleNext} className={primaryBtnClass}>
                下一步
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Step 3 — 證明文件 */}
        <div className={cn(currentStep !== 3 && "hidden")}>
          <Card className={formCardClass}>
            <FormCardHeader
              step={3}
              title={activeStepMeta.title}
              description={`${activeStepMeta.description}。出款銀行帳戶將於審批通過後，於 Stripe 開戶流程中設定，無需在此填寫戶口號碼。`}
            />
            <CardContent className={formCardContentClass}>
              <p className="font-sans text-[11px] text-text-disabled leading-relaxed">
                請上傳 4 份證明文件（{UPLOAD_FORMAT_HINT}）
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {KYC_DOCUMENT_TYPES.map((documentType) => (
                  <DocumentUploadField
                    key={documentType}
                    documentType={documentType}
                    uploaded={documents[documentType] ?? null}
                    uploading={uploadingTypes.has(documentType)}
                    uploadError={uploadErrors[documentType] ?? null}
                    fieldError={
                      displayErrors?.[
                        DOC_FIELD_NAME[
                          documentType
                        ] as keyof MerchantKycFormErrors
                      ]
                    }
                    onFileSelected={(file) => handleUpload(documentType, file)}
                  />
                ))}
              </div>
              <FieldError message={displayErrors?.form} />
            </CardContent>
            <CardFooter
              className={cn(
                formCardFooterClass,
                "flex-row justify-between",
              )}
            >
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className={outlineBtnClass}
              >
                上一步
              </Button>
              <Button
                type="submit"
                disabled={isPending || !allDocumentsUploaded}
                className={primaryBtnClass}
              >
                {isPending
                  ? "提交中…"
                  : isResubmission
                    ? "重新提交申請"
                    : "提交商戶入駐申請"}
              </Button>
            </CardFooter>
            {!allDocumentsUploaded && (
              <p className="px-(--card-spacing) pb-3 pt-0 font-sans text-[11px] text-text-disabled">
                請先上傳齊全部 4 份文件方可提交。
              </p>
            )}
          </Card>
        </div>
      </form>
    </div>
  );
}
