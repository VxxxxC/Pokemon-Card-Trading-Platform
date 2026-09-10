-- Stripe Connect 就緒狀態 flags（由 webhook account.updated 同步，fail-closed 預設 false）。
-- 只有 charges_enabled && payouts_enabled 先可以成為 transfer 收款方。
ALTER TABLE public.kyc_records
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;
