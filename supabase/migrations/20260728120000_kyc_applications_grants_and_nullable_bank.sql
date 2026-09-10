-- 修復 service_role 表級權限（root cause of "permission denied for table kyc_applications"）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_applications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_documents TO service_role;

-- 手填銀行欄位改 optional（出款銀行改由 Stripe onboarding 收集）
ALTER TABLE public.kyc_applications
  ALTER COLUMN bank_name DROP NOT NULL,
  ALTER COLUMN bank_code DROP NOT NULL,
  ALTER COLUMN branch_code DROP NOT NULL,
  ALTER COLUMN bank_account_number DROP NOT NULL,
  ALTER COLUMN bank_account_masked DROP NOT NULL,
  ALTER COLUMN bank_account_holder DROP NOT NULL;
