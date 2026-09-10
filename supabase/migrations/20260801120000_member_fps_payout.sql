-- Member FPS payout schema (Phase B)
-- Weekly manual FPS batch for member auth escrow sellers (T+3 hold).

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'member_seller_payout_status'
    ) THEN
        CREATE TYPE public.member_seller_payout_status AS ENUM (
            'none',
            'held',
            'ready',
            'processing',
            'paid',
            'frozen',
            'failed'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'payout_request_status'
    ) THEN
        CREATE TYPE public.payout_request_status AS ENUM (
            'pending',
            'ready',
            'processing',
            'completed',
            'failed'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'payout_batch_status'
    ) THEN
        CREATE TYPE public.payout_batch_status AS ENUM (
            'draft',
            'processing',
            'completed'
        );
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. member_orders payout hold columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payout_hold_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS seller_payout_status public.member_seller_payout_status
        NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_member_orders_seller_payout_ready
    ON public.member_orders (seller_payout_status, payout_hold_until)
    WHERE seller_payout_status IN ('held', 'ready');

-- ---------------------------------------------------------------------------
-- 3. profiles.fps_id (snapshot source for payout_requests)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS fps_id TEXT;

-- ---------------------------------------------------------------------------
-- 4. platform_settings (FPS batch config seed)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_public_read ON public.platform_settings;
CREATE POLICY settings_public_read ON public.platform_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS settings_admin_write ON public.platform_settings;
CREATE POLICY settings_admin_write ON public.platform_settings
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

INSERT INTO public.platform_settings (key, value)
VALUES (
    'fps_payout_config',
    '{"batchWeekday":3,"cutoffWeekday":2,"timezone":"Asia/Hong_Kong"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. payout_batches (weekly FPS audit)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_date DATE NOT NULL,
    cutoff_at TIMESTAMPTZ NOT NULL,
    status public.payout_batch_status NOT NULL DEFAULT 'draft',
    processed_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_scheduled_date
    ON public.payout_batches (scheduled_date DESC);

-- ---------------------------------------------------------------------------
-- 6. payout_requests (1:1 member_orders)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.member_orders(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    fps_id_snapshot TEXT NOT NULL,
    status public.payout_request_status NOT NULL DEFAULT 'pending',
    ready_at TIMESTAMPTZ,
    batch_id UUID REFERENCES public.payout_batches(id) ON DELETE SET NULL,
    admin_fps_reference TEXT,
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payout_requests_order_id_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_status_ready_at
    ON public.payout_requests (status, ready_at);

CREATE INDEX IF NOT EXISTS idx_payout_requests_seller_id
    ON public.payout_requests (seller_id);

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payout_batches_admin_all ON public.payout_batches;
CREATE POLICY payout_batches_admin_all ON public.payout_batches
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS payout_requests_owner_read ON public.payout_requests;
CREATE POLICY payout_requests_owner_read ON public.payout_requests
    FOR SELECT
    USING (seller_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS payout_requests_admin_write ON public.payout_requests;
CREATE POLICY payout_requests_admin_write ON public.payout_requests
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_requests TO service_role;
