-- Repair: remote may have recorded version 20260803120000 before `shipped` was committed
-- (duplicate migration timestamp with profiles_fps_name). Idempotent re-apply.

ALTER TYPE public.escrow_state ADD VALUE IF NOT EXISTS 'shipped' AFTER 'payment_held';
