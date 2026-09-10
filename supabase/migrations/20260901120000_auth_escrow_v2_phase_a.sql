-- Auth Escrow v2 — Phase A: schema + platform config + read helpers (no prepare/capture changes).

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        INNER JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'seller_settlement_status'
    ) THEN
        CREATE TYPE public.seller_settlement_status AS ENUM (
            'none',
            'pending',
            'cleared',
            'waived'
        );
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        INNER JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'seller_receivable_status'
    ) THEN
        CREATE TYPE public.seller_receivable_status AS ENUM (
            'pending',
            'paid',
            'waived',
            'cancelled'
        );
    END IF;
END
$$;

ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'grading_fail_recovery';

-- ---------------------------------------------------------------------------
-- 2. Order columns (two-leg SF shipping + settlement gate)
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS inbound_shipping_fee NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS outbound_shipping_fee NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS buyer_total_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS seller_settlement_status public.seller_settlement_status
        NOT NULL DEFAULT 'none'::public.seller_settlement_status;

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS inbound_shipping_fee NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS outbound_shipping_fee NUMERIC NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS seller_settlement_status public.seller_settlement_status
        NOT NULL DEFAULT 'none'::public.seller_settlement_status;

-- ---------------------------------------------------------------------------
-- 3. Platform config seed
-- ---------------------------------------------------------------------------

INSERT INTO public.platform_settings (key, value)
VALUES (
    'auth_escrow_config',
    '{"sf_leg_fee_hkd": 30, "auth_fee_hkd": 150}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Read helpers (Phase B prepare RPCs will consume)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_platform_auth_escrow_config()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT ps.value
            FROM public.platform_settings ps
            WHERE ps.key = 'auth_escrow_config'
        ),
        '{}'::jsonb
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_platform_auth_sf_leg_fee()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_fee NUMERIC;
BEGIN
    v_fee := (public.fn_platform_auth_escrow_config() ->> 'sf_leg_fee_hkd')::numeric;
    IF v_fee IS NULL OR v_fee < 0 THEN
        RETURN 30::numeric;
    END IF;
    RETURN v_fee;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_platform_auth_fee_hkd()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_fee NUMERIC;
BEGIN
    v_fee := (public.fn_platform_auth_escrow_config() ->> 'auth_fee_hkd')::numeric;
    IF v_fee IS NULL OR v_fee < 0 THEN
        RETURN 150::numeric;
    END IF;
    RETURN v_fee;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_platform_auth_escrow_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_auth_escrow_config()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_platform_auth_sf_leg_fee() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_auth_sf_leg_fee()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_platform_auth_fee_hkd() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_platform_auth_fee_hkd()
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. seller_receivables (Member FPS recovery; Merchant uses merchant_ledgers in Phase C)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.seller_receivables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_kind TEXT NOT NULL,
    order_id UUID NOT NULL,
    seller_id UUID NOT NULL REFERENCES public.profiles(id),
    amount_hkd NUMERIC NOT NULL,
    status public.seller_receivable_status NOT NULL DEFAULT 'pending'::public.seller_receivable_status,
    fps_reference TEXT,
    stripe_fee_hkd NUMERIC,
    notes TEXT,
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT seller_receivables_order_kind_check
        CHECK (order_kind IN ('member', 'merchant')),
    CONSTRAINT seller_receivables_amount_positive
        CHECK (amount_hkd > 0),
    CONSTRAINT seller_receivables_order_unique
        UNIQUE (order_kind, order_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_receivables_seller_status
    ON public.seller_receivables (seller_id, status);

CREATE INDEX IF NOT EXISTS idx_seller_receivables_order
    ON public.seller_receivables (order_kind, order_id);

ALTER TABLE public.seller_receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_receivables_seller_select ON public.seller_receivables;
CREATE POLICY seller_receivables_seller_select ON public.seller_receivables
    FOR SELECT
    USING (seller_id = auth.uid());

DROP POLICY IF EXISTS seller_receivables_admin_all ON public.seller_receivables;
CREATE POLICY seller_receivables_admin_all ON public.seller_receivables
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

GRANT SELECT ON public.seller_receivables TO authenticated;
GRANT ALL ON public.seller_receivables TO service_role;
