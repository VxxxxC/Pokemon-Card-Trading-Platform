-- Admin grading workbench: unified Member C2C + Merchant B2C authentication queue,
-- refund saga, audit logs, and payout / buyer-receipt guards.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS auth_graded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auth_graded_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS auth_notes TEXT,
    ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS refund_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
    ADD COLUMN IF NOT EXISTS refund_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_error TEXT;

ALTER TABLE public.member_orders
    DROP CONSTRAINT IF EXISTS member_orders_refund_status_check;

ALTER TABLE public.member_orders
    ADD CONSTRAINT member_orders_refund_status_check
    CHECK (refund_status IN ('none', 'processing', 'refunded', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_orders_stripe_refund_id
    ON public.member_orders (stripe_refund_id)
    WHERE stripe_refund_id IS NOT NULL;

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS inbound_tracking_no TEXT,
    ADD COLUMN IF NOT EXISTS outbound_tracking_no TEXT,
    ADD COLUMN IF NOT EXISTS platform_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auth_result TEXT,
    ADD COLUMN IF NOT EXISTS auth_graded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auth_graded_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS auth_notes TEXT,
    ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS refund_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
    ADD COLUMN IF NOT EXISTS refund_attempted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_error TEXT;

ALTER TABLE public.merchant_orders
    DROP CONSTRAINT IF EXISTS merchant_orders_refund_status_check;

ALTER TABLE public.merchant_orders
    ADD CONSTRAINT merchant_orders_refund_status_check
    CHECK (refund_status IN ('none', 'processing', 'refunded', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_orders_stripe_refund_id
    ON public.merchant_orders (stripe_refund_id)
    WHERE stripe_refund_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.grading_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_kind TEXT NOT NULL CHECK (order_kind IN ('member', 'merchant')),
    order_id UUID NOT NULL,
    admin_id UUID NOT NULL REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grading_audit_logs_order
    ON public.grading_audit_logs (order_kind, order_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Admin helper (must exist before RLS policies referencing is_admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
    );
$$;

ALTER TABLE public.grading_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grading_audit_logs_admin_read ON public.grading_audit_logs;
CREATE POLICY grading_audit_logs_admin_read
    ON public.grading_audit_logs
    FOR SELECT
    USING (public.is_admin());

CREATE OR REPLACE FUNCTION public._grading_require_admin()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    v_admin_id := auth.uid();
    IF v_admin_id IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION '無管理員權限';
    END IF;
    RETURN v_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._grading_write_audit_log(
    p_order_kind TEXT,
    p_order_id UUID,
    p_admin_id UUID,
    p_action TEXT,
    p_from_status TEXT,
    p_to_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.grading_audit_logs (
        order_kind,
        order_id,
        admin_id,
        action,
        from_status,
        to_status,
        notes
    ) VALUES (
        p_order_kind,
        p_order_id,
        p_admin_id,
        p_action,
        p_from_status,
        p_to_status,
        NULLIF(trim(COALESCE(p_notes, '')), '')
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Merchant seller inbound tracking (auth orders)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_merchant_auth_inbound_tracking(
    p_order_id UUID,
    p_merchant_id UUID,
    p_tracking_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated RECORD;
    v_tracking TEXT;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_merchant_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    IF v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的順豐物流單號。';
    END IF;

    UPDATE public.merchant_orders
    SET
        inbound_tracking_no = v_tracking,
        updated_at = now()
    WHERE id = p_order_id
      AND merchant_id = p_merchant_id
      AND requires_authentication = true
      AND escrow_status = 'payment_held'::public.escrow_state
      AND stripe_payment_intent_id IS NOT NULL
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
        RAISE EXCEPTION '上載失敗：訂單狀態不合法或您非此筆交易的商戶。';
    END IF;

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_merchant_auth_inbound_tracking(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_merchant_auth_inbound_tracking(UUID, UUID, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Admin grading transitions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_confirm_grading_intake(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_from_status TEXT;
    v_updated RECORD;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'grading',
            platform_received_at = now(),
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'custody'
          AND status = 'pending'
          AND inbound_tracking_no IS NOT NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticating',
            platform_received_at = now(),
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'payment_held'
          AND inbound_tracking_no IS NOT NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'confirm_intake',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'grading' ELSE 'authenticating' END,
        NULL
    );

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_pass_grading(
    p_order_kind TEXT,
    p_order_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_from_status TEXT;
    v_updated RECORD;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'shipped',
            auth_result = 'passed',
            auth_graded_at = now(),
            auth_graded_by = v_admin_id,
            auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'grading'
          AND status = 'pending'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticated',
            auth_result = 'passed',
            auth_graded_at = now(),
            auth_graded_by = v_admin_id,
            auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'authenticating'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'pass_grading',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'shipped' ELSE 'authenticated' END,
        p_notes
    );

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_submit_grading_outbound(
    p_order_kind TEXT,
    p_order_id UUID,
    p_tracking_no TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_from_status TEXT;
    v_tracking TEXT;
    v_updated RECORD;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_tracking := NULLIF(trim(COALESCE(p_tracking_no, '')), '');
    IF v_tracking IS NULL THEN
        RAISE EXCEPTION '請輸入有效的出庫物流單號。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        UPDATE public.member_orders
        SET
            outbound_tracking_no = v_tracking,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'shipped'
          AND auth_result = 'passed'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '出庫物流更新失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.escrow_status::TEXT
        INTO v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        UPDATE public.merchant_orders
        SET
            outbound_tracking_no = v_tracking,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'authenticated'
          AND auth_result = 'passed'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '出庫物流更新失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'submit_outbound',
        v_from_status,
        v_from_status,
        v_tracking
    );

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Auth grading refund saga
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_admin_prepare_auth_refund(
    p_order_kind TEXT,
    p_order_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_refund_amount NUMERIC;
    v_payment_intent_id TEXT;
    v_listing_id UUID;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.escrow_status::TEXT,
            COALESCE(mo.item_subtotal, mo.final_price),
            mo.stripe_payment_intent_id,
            mo.listing_id
        INTO
            v_from_status,
            v_refund_amount,
            v_payment_intent_id,
            v_listing_id
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_from_status IS DISTINCT FROM 'grading' THEN
            RAISE EXCEPTION '僅鑑定中的訂單可發起退款。';
        END IF;

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            refund_amount = v_refund_amount,
            refund_attempted_at = now(),
            refund_error = NULL,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '退款已在處理中或已完成。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.escrow_status::TEXT,
            COALESCE(mo.item_subtotal, mo.final_price) + COALESCE(mo.shipping_fee, 0),
            mo.stripe_payment_intent_id,
            mo.listing_id
        INTO
            v_from_status,
            v_refund_amount,
            v_payment_intent_id,
            v_listing_id
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_from_status IS DISTINCT FROM 'authenticating' THEN
            RAISE EXCEPTION '僅鑑定中的訂單可發起退款。';
        END IF;

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            refund_amount = v_refund_amount,
            refund_attempted_at = now(),
            refund_error = NULL,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '退款已在處理中或已完成。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法退款。';
    END IF;

    IF v_refund_amount IS NULL OR v_refund_amount <= 0 THEN
        RAISE EXCEPTION '退款金額異常。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'prepare_refund',
        v_from_status,
        v_from_status,
        p_reason
    );

    RETURN jsonb_build_object(
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'listing_id', v_listing_id,
        'refund_amount', v_refund_amount,
        'stripe_payment_intent_id', v_payment_intent_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_refund(
    p_order_kind TEXT,
    p_order_id UUID,
    p_refund_id TEXT,
    p_refund_amount_cents INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_refund_amount NUMERIC;
    v_from_status TEXT;
    v_existing_refund_id TEXT;
    v_updated RECORD;
    v_expected_cents INTEGER;
BEGIN
    IF p_refund_id IS NULL OR btrim(p_refund_id) = '' THEN
        RAISE EXCEPTION '缺少 Stripe refund id。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.refund_amount,
            mo.listing_id,
            mo.stripe_refund_id
        INTO
            v_from_status,
            v_refund_amount,
            v_listing_id,
            v_existing_refund_id
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_existing_refund_id IS NOT NULL AND v_existing_refund_id = p_refund_id THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        v_expected_cents := round(COALESCE(v_refund_amount, 0) * 100)::INTEGER;
        IF v_expected_cents IS DISTINCT FROM p_refund_amount_cents THEN
            RAISE EXCEPTION '退款金額與快照不一致。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled',
            status = 'cancelled',
            auth_result = 'failed',
            refund_status = 'refunded',
            stripe_refund_id = p_refund_id,
            refunded_at = now(),
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('processing', 'refunded')
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '退款 finalize 失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.refund_amount,
            mo.listing_id,
            mo.stripe_refund_id
        INTO
            v_from_status,
            v_refund_amount,
            v_listing_id,
            v_existing_refund_id
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_existing_refund_id IS NOT NULL AND v_existing_refund_id = p_refund_id THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        v_expected_cents := round(COALESCE(v_refund_amount, 0) * 100)::INTEGER;
        IF v_expected_cents IS DISTINCT FROM p_refund_amount_cents THEN
            RAISE EXCEPTION '退款金額與快照不一致。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'refunded',
            auth_result = 'failed',
            refund_status = 'refunded',
            stripe_refund_id = p_refund_id,
            refunded_at = now(),
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('processing', 'refunded')
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '退款 finalize 失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        COALESCE(auth.uid(), (SELECT admin_id FROM public.grading_audit_logs
                              WHERE order_kind = p_order_kind AND order_id = p_order_id
                                AND action = 'prepare_refund'
                              ORDER BY created_at DESC LIMIT 1)),
        'finalize_refund',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'cancelled' ELSE 'refunded' END,
        p_refund_id
    );

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_auth_refund_failed(
    p_order_kind TEXT,
    p_order_id UUID,
    p_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated RECORD;
BEGIN
    IF p_order_kind = 'member' THEN
        UPDATE public.member_orders
        SET
            refund_status = 'failed',
            refund_error = NULLIF(trim(COALESCE(p_error, '')), ''),
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND refund_status = 'processing'
        RETURNING * INTO v_updated;
    ELSIF p_order_kind = 'merchant' THEN
        UPDATE public.merchant_orders
        SET
            refund_status = 'failed',
            refund_error = NULLIF(trim(COALESCE(p_error, '')), ''),
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND refund_status = 'processing'
        RETURNING * INTO v_updated;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION '無法標記退款失敗：訂單狀態不合法。';
    END IF;

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_updated));
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Admin grading queue search
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_admin_grading_orders(
    p_tab TEXT,
    p_order_kind TEXT DEFAULT NULL,
    p_keyword TEXT DEFAULT NULL,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_offset INTEGER;
    v_limit INTEGER;
    v_keyword TEXT;
    v_rows JSONB;
    v_total BIGINT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_limit := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
    v_keyword := NULLIF(trim(COALESCE(p_keyword, '')), '');

    WITH unified AS (
        SELECT
            'member'::TEXT AS order_kind,
            mo.id AS order_id,
            mo.order_number,
            mo.buyer_id,
            mo.seller_id AS counterparty_seller_id,
            NULL::UUID AS merchant_id,
            mo.listing_id,
            COALESCE(mo.item_subtotal, mo.final_price) AS item_subtotal,
            0::NUMERIC AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.inbound_tracking_no,
            mo.outbound_tracking_no,
            mo.auth_result,
            mo.refund_status,
            mo.refund_amount,
            mo.escrow_status::TEXT AS escrow_status,
            mo.platform_received_at,
            mo.auth_graded_at,
            mo.created_at,
            mo.updated_at,
            pb.display_name AS buyer_display_name,
            pb.username AS buyer_username,
            ps.display_name AS seller_display_name,
            ps.username AS seller_username,
            NULL::TEXT AS shop_name,
            pc.name_zh AS product_name_zh,
            pc.name_ja AS product_name_ja,
            pc.name_en AS product_name_en,
            l.grading_company,
            l.grading_score
        FROM public.member_orders mo
        JOIN public.profiles pb ON pb.id = mo.buyer_id
        JOIN public.profiles ps ON ps.id = mo.seller_id
        JOIN public.listings l ON l.id = mo.listing_id
        JOIN public.product_catalog pc ON pc.id = l.product_id
        WHERE mo.use_authentication = true

        UNION ALL

        SELECT
            'merchant'::TEXT AS order_kind,
            mo.id AS order_id,
            mo.order_number,
            mo.buyer_id,
            NULL::UUID AS counterparty_seller_id,
            mo.merchant_id,
            mo.listing_id,
            COALESCE(mo.item_subtotal, mo.final_price) AS item_subtotal,
            COALESCE(mo.shipping_fee, 0) AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.inbound_tracking_no,
            mo.outbound_tracking_no,
            mo.auth_result,
            mo.refund_status,
            mo.refund_amount,
            mo.escrow_status::TEXT AS escrow_status,
            mo.platform_received_at,
            mo.auth_graded_at,
            mo.created_at,
            mo.updated_at,
            pb.display_name AS buyer_display_name,
            pb.username AS buyer_username,
            NULL::TEXT AS seller_display_name,
            NULL::TEXT AS seller_username,
            ms.shop_name,
            pc.name_zh AS product_name_zh,
            pc.name_ja AS product_name_ja,
            pc.name_en AS product_name_en,
            l.grading_company,
            l.grading_score
        FROM public.merchant_orders mo
        JOIN public.profiles pb ON pb.id = mo.buyer_id
        JOIN public.listings l ON l.id = mo.listing_id
        JOIN public.product_catalog pc ON pc.id = l.product_id
        LEFT JOIN public.merchant_shops ms ON ms.merchant_id = mo.merchant_id
        WHERE mo.requires_authentication = true
    ),
    filtered AS (
        SELECT *
        FROM unified u
        WHERE (
            p_order_kind IS NULL
            OR btrim(p_order_kind) = ''
            OR u.order_kind = p_order_kind
        )
        AND (
            v_keyword IS NULL
            OR u.order_number ILIKE '%' || v_keyword || '%'
            OR u.buyer_display_name ILIKE '%' || v_keyword || '%'
            OR u.buyer_username ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.seller_display_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.seller_username, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.shop_name, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.inbound_tracking_no, '') ILIKE '%' || v_keyword || '%'
            OR COALESCE(u.outbound_tracking_no, '') ILIKE '%' || v_keyword || '%'
        )
        AND (
            (p_tab = 'awaiting_intake' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'custody' AND u.inbound_tracking_no IS NOT NULL)
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'payment_held' AND u.inbound_tracking_no IS NOT NULL)
            ))
            OR (p_tab = 'grading' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'grading')
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'authenticating')
            ))
            OR (p_tab = 'awaiting_outbound' AND (
                (u.order_kind = 'member' AND u.escrow_status = 'shipped' AND u.auth_result = 'passed')
                OR (u.order_kind = 'merchant' AND u.escrow_status = 'authenticated' AND u.auth_result = 'passed')
            ))
            OR (p_tab = 'closed' AND (
                (u.order_kind = 'member' AND u.escrow_status IN ('released', 'cancelled'))
                OR (u.order_kind = 'merchant' AND u.escrow_status IN ('completed_and_transferred', 'refunded'))
                OR u.refund_status = 'refunded'
            ))
        )
    )
    SELECT COUNT(*) INTO v_total FROM filtered;

    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC), '[]'::JSONB)
    INTO v_rows
    FROM (
        SELECT * FROM filtered
        ORDER BY updated_at DESC NULLS LAST, created_at DESC
        LIMIT v_limit OFFSET v_offset
    ) f;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total', v_total,
        'page', GREATEST(COALESCE(p_page, 1), 1),
        'page_size', v_limit
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_grading_audit_history(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_rows JSONB;
BEGIN
    v_admin_id := public._grading_require_admin();

    SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::JSONB)
    INTO v_rows
    FROM (
        SELECT
            gal.id,
            gal.order_kind,
            gal.order_id,
            gal.admin_id,
            gal.action,
            gal.from_status,
            gal.to_status,
            gal.notes,
            gal.created_at,
            p.display_name AS admin_display_name,
            p.username AS admin_username
        FROM public.grading_audit_logs gal
        JOIN public.profiles p ON p.id = gal.admin_id
        WHERE gal.order_kind = p_order_kind
          AND gal.order_id = p_order_id
        ORDER BY gal.created_at DESC
    ) l;

    RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Buyer receipt + merchant payout guards for auth orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_confirm_buyer_received(
    p_order_id UUID,
    p_buyer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_seller_id UUID;
    v_final_price NUMERIC;
    v_updated RECORD;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_buyer_id THEN
        RAISE EXCEPTION '請先登入後再操作';
    END IF;

    SELECT listing_id, seller_id, final_price
    INTO v_listing_id, v_seller_id, v_final_price
    FROM public.member_orders
    WHERE id = p_order_id
        AND buyer_id = p_buyer_id
        AND use_authentication = true
        AND escrow_status = 'shipped'
        AND status = 'pending'
        AND auth_result = 'passed'
        AND outbound_tracking_no IS NOT NULL
        AND btrim(outbound_tracking_no) <> '';

    IF NOT FOUND THEN
        RAISE EXCEPTION '確認收貨失敗：訂單狀態不合法、鑑定未通過或尚未出庫。';
    END IF;

    UPDATE public.member_orders
    SET
        escrow_status = 'released',
        status = 'completed',
        updated_at = now()
    WHERE id = p_order_id
    RETURNING * INTO v_updated;

    UPDATE public.listings SET status = 'sold' WHERE id = v_listing_id;

    PERFORM public.fn_archive_seller_collection_for_listing(
        v_listing_id,
        v_seller_id,
        v_final_price
    );

    RETURN jsonb_build_object('order', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_prepare_merchant_order_payout(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_buyer_id UUID;
    v_merchant_id UUID;
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_auth_result TEXT;
    v_outbound_tracking TEXT;
    v_item_subtotal NUMERIC;
    v_shipping_fee NUMERIC;
    v_auth_fee NUMERIC;
    v_total_amount NUMERIC;
    v_payment_intent_id TEXT;
    v_existing_rate NUMERIC;
    v_existing_commission NUMERIC;
    v_existing_payout NUMERIC;
    v_existing_transfer_id TEXT;
    v_existing_destination TEXT;
    v_kyc_status public.kyc_state;
    v_charges_enabled BOOLEAN;
    v_payouts_enabled BOOLEAN;
    v_destination TEXT;
    v_commission_rate CONSTANT NUMERIC := 0.08;
    v_commission NUMERIC;
    v_payout NUMERIC;
    v_result_order_id UUID;
BEGIN
    SELECT
        mo.buyer_id,
        mo.merchant_id,
        mo.escrow_status,
        COALESCE(mo.requires_authentication, false),
        mo.auth_result,
        mo.outbound_tracking_no,
        mo.item_subtotal,
        mo.shipping_fee,
        mo.auth_fee,
        mo.total_amount,
        mo.stripe_payment_intent_id,
        mo.commission_rate_applied,
        mo.commission_amount,
        mo.merchant_payout_amount,
        mo.stripe_transfer_id,
        mo.stripe_destination_account_id
    INTO
        v_buyer_id,
        v_merchant_id,
        v_escrow_status,
        v_requires_auth,
        v_auth_result,
        v_outbound_tracking,
        v_item_subtotal,
        v_shipping_fee,
        v_auth_fee,
        v_total_amount,
        v_payment_intent_id,
        v_existing_rate,
        v_existing_commission,
        v_existing_payout,
        v_existing_transfer_id,
        v_existing_destination
    FROM public.merchant_orders mo
    WHERE mo.id = p_order_id
    FOR UPDATE OF mo;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF auth.uid() IS DISTINCT FROM v_buyer_id THEN
        RAISE EXCEPTION '操作失敗：僅買家可確認完成交易。';
    END IF;

    IF v_existing_transfer_id IS NOT NULL
       AND v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'order_id', p_order_id,
            'stripe_transfer_id', v_existing_transfer_id
        );
    END IF;

    IF v_escrow_status = 'completed_and_transferred'::public.escrow_state THEN
        RAISE EXCEPTION '此訂單已由舊流程完成，需由管理員核對撥款。';
    END IF;

    IF v_requires_auth THEN
        IF v_escrow_status IS DISTINCT FROM 'authenticated'::public.escrow_state
           OR v_auth_result IS DISTINCT FROM 'passed'
           OR v_outbound_tracking IS NULL
           OR btrim(v_outbound_tracking) = '' THEN
            RAISE EXCEPTION '鑑定訂單尚未通過鑑定或尚未出庫，無法確認收貨。';
        END IF;
    ELSIF v_escrow_status NOT IN ('payment_held'::public.escrow_state) THEN
        RAISE EXCEPTION '此訂單尚未完成付款或目前狀態不允許撥款。';
    END IF;

    SELECT
        kr.kyc_status,
        kr.stripe_charges_enabled,
        kr.stripe_payouts_enabled,
        kr.stripe_account_id
    INTO
        v_kyc_status,
        v_charges_enabled,
        v_payouts_enabled,
        v_destination
    FROM public.kyc_records kr
    WHERE kr.merchant_id = v_merchant_id
    LIMIT 1;

    IF NOT FOUND
       OR v_kyc_status IS DISTINCT FROM 'verified'::public.kyc_state
       OR NOT COALESCE(v_charges_enabled, false)
       OR NOT COALESCE(v_payouts_enabled, false)
       OR v_destination IS NULL
       OR btrim(v_destination) = '' THEN
        RAISE EXCEPTION '商戶收款帳戶尚未通過驗證，暫時無法撥款。';
    END IF;

    IF v_payment_intent_id IS NULL OR btrim(v_payment_intent_id) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法撥款。';
    END IF;

    IF v_item_subtotal IS NULL
       OR v_item_subtotal <= 0
       OR v_total_amount IS NULL
       OR v_total_amount <= 0 THEN
        RAISE EXCEPTION '訂單金額資料不完整，無法撥款。';
    END IF;

    v_shipping_fee := COALESCE(v_shipping_fee, 0);
    v_auth_fee := COALESCE(v_auth_fee, 0);

    IF v_total_amount IS DISTINCT FROM
       (v_item_subtotal + v_shipping_fee + v_auth_fee) THEN
        RAISE EXCEPTION '訂單金額明細不一致，已攔截撥款。';
    END IF;

    v_commission := round(v_item_subtotal * v_commission_rate, 2);
    v_payout := round(v_item_subtotal - v_commission + v_shipping_fee, 2);

    IF v_payout <= 0 OR v_payout > v_total_amount THEN
        RAISE EXCEPTION '商戶撥款金額異常，已攔截撥款。';
    END IF;

    IF v_existing_rate IS NOT NULL
       AND (
           v_existing_rate IS DISTINCT FROM v_commission_rate
           OR v_existing_commission IS DISTINCT FROM v_commission
           OR v_existing_payout IS DISTINCT FROM v_payout
           OR v_existing_destination IS DISTINCT FROM v_destination
       ) THEN
        RAISE EXCEPTION '訂單撥款快照不一致，需由管理員處理。';
    END IF;

    UPDATE public.merchant_orders
    SET
        commission_rate_applied = COALESCE(commission_rate_applied, v_commission_rate),
        commission_amount = COALESCE(commission_amount, v_commission),
        merchant_payout_amount = COALESCE(merchant_payout_amount, v_payout),
        stripe_destination_account_id = COALESCE(stripe_destination_account_id, v_destination),
        buyer_confirmed_at = COALESCE(buyer_confirmed_at, now()),
        payout_status = 'processing',
        payout_attempted_at = now(),
        payout_error = NULL,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING
        id,
        stripe_payment_intent_id,
        total_amount,
        commission_amount,
        merchant_payout_amount,
        stripe_destination_account_id
    INTO
        v_result_order_id,
        v_payment_intent_id,
        v_total_amount,
        v_commission,
        v_payout,
        v_destination;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_id', v_result_order_id,
        'stripe_payment_intent_id', v_payment_intent_id,
        'total_amount', v_total_amount,
        'commission_amount', v_commission,
        'merchant_payout_amount', v_payout,
        'stripe_destination_account_id', v_destination
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_admin_confirm_grading_intake(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_confirm_grading_intake(TEXT, UUID)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_pass_grading(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_pass_grading(TEXT, UUID, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_submit_grading_outbound(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_submit_grading_outbound(TEXT, UUID, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_prepare_auth_refund(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_prepare_auth_refund(TEXT, UUID, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_finalize_auth_refund(TEXT, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_auth_refund(TEXT, UUID, TEXT, INTEGER)
    TO service_role;

REVOKE ALL ON FUNCTION public.rpc_mark_auth_refund_failed(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_auth_refund_failed(TEXT, UUID, TEXT)
    TO service_role;

REVOKE ALL ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_admin_grading_audit_history(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_grading_audit_history(TEXT, UUID)
    TO authenticated, service_role;
