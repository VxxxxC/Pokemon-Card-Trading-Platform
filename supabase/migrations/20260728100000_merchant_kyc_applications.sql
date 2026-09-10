-- Merchant KYC 申請工作流：kyc_applications（PII + 審核狀態）+ kyc_documents（文件 metadata）
-- + kyc-documents 私有 Storage bucket（自動建立，唔使人手開）。
--
-- 安全模型：兩張表 RLS enable 但【零 policy】= client（anon/authenticated）完全不可讀寫，
-- 所有存取一律經 server actions 以 service role（createAdminClient）進行，
-- action 層自行做 auth + owner/admin 檢查，並只回傳脫敏欄位俾 UI。
-- 對外狀態 flag 繼續由現有 kyc_records 承載（load-seller-profile / dashboard chip / 開店 trigger 不變）。

-- ─────────────────────────────────────────────────────────────
-- 1. Enum
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_application_status') THEN
    CREATE TYPE public.kyc_application_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. kyc_applications — 一人最多一個申請（rejected 後可重交，原行 reset）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,

  -- 公司（Stripe company.*）
  company_name_en      text NOT NULL,
  company_name_zh      text,
  br_number            text NOT NULL,
  company_address      jsonb NOT NULL,          -- { line1, line2?, city, state? } (HK)
  company_phone        text NOT NULL,

  -- 代表人／董事（Stripe persons.*）
  rep_name_en          text NOT NULL,
  rep_name_zh          text,
  rep_dob              date NOT NULL,
  rep_hkid             text NOT NULL,           -- 敏感：只有 service role 可讀
  rep_address          jsonb NOT NULL,
  rep_email            text NOT NULL,
  rep_phone            text NOT NULL,
  rep_title            text NOT NULL,           -- 職位，如 Director

  -- 銀行出款戶口（Stripe external_account；完整號碼須留底供 approve 時建立）
  bank_name            text NOT NULL,
  bank_code            text NOT NULL,           -- 3 位銀行代碼
  branch_code          text NOT NULL,           -- 3 位分行代碼
  bank_account_number  text NOT NULL,           -- 敏感：只有 service role 可讀
  bank_account_masked  text NOT NULL,           -- ***-1234 供 UI 顯示
  bank_account_holder  text NOT NULL,           -- 須與公司名相符

  -- 審核工作流
  status               public.kyc_application_status NOT NULL DEFAULT 'pending',
  reject_reason        text,
  reviewed_by          uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at          timestamptz,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kyc_applications_status
  ON public.kyc_applications (status);

-- ─────────────────────────────────────────────────────────────
-- 3. kyc_documents — 每份申請 4 類文件，各類最多一份（重交覆蓋）
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL REFERENCES public.kyc_applications (id) ON DELETE CASCADE,
  document_type    text NOT NULL CHECK (
    document_type IN ('br_certificate', 'bank_statement', 'rep_id_front', 'rep_id_back')
  ),
  storage_path     text NOT NULL,               -- kyc-documents bucket 內路徑
  content_type     text NOT NULL,
  stripe_file_id   text,                        -- 同步 Stripe 後回寫 file_xxx
  created_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (application_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_application
  ON public.kyc_documents (application_id);

-- ─────────────────────────────────────────────────────────────
-- 4. updated_at 觸發器
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_kyc_applications_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_applications_touch_updated_at ON public.kyc_applications;
CREATE TRIGGER trg_kyc_applications_touch_updated_at
BEFORE UPDATE ON public.kyc_applications
FOR EACH ROW EXECUTE FUNCTION public.fn_kyc_applications_touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. RLS：enable 但零 policy = client 全拒（fail-closed）
--    所有讀寫經 server actions 以 service role 進行
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.kyc_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 6. 私有 Storage bucket（10MB 上限；pdf/jpg/png/webp）
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 私有 bucket + 無 storage.objects policy = 只有 service role 可讀寫（預設 fail-closed）。
