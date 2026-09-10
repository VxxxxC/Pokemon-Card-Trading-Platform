-- Escrow P1: goods capture on pass, void uncaptured on fail, fault_party

-- ---------------------------------------------------------------------------
-- 1. fault_party enum + columns
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'grading_fault_party' AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.grading_fault_party AS ENUM (
            'buyer',
            'seller',
            'platform',
            'carrier',
            'inconclusive'
        );
    END IF;
END $$;

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS fault_party public.grading_fault_party;

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS fault_party public.grading_fault_party;

-- ---------------------------------------------------------------------------
-- 2. Goods capture prepare / finalize (admin pass grading saga)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_goods_capture(
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
    v_pi TEXT;
    v_capture_status public.payment_capture_status;
    v_goods_amount NUMERIC;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            COALESCE(mo.item_subtotal, mo.final_price),
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_goods_amount, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'goods_cents', ROUND(COALESCE(v_goods_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成入庫鑑定費扣款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.escrow_status = 'grading'::public.member_escrow_status
              AND mo.status = 'pending'
              AND mo.auth_result IS NULL
        ) THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            COALESCE(mo.item_subtotal, mo.final_price) + COALESCE(mo.shipping_fee, 0),
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_goods_amount, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'goods_cents', ROUND(COALESCE(v_goods_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成入庫鑑定費扣款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.escrow_status = 'authenticating'::public.escrow_state
              AND mo.auth_result IS NULL
        ) THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：找不到 Stripe PaymentIntent。';
    END IF;

    IF COALESCE(v_goods_amount, 0) <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：卡價金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'goods_cents', ROUND(v_goods_amount * 100)::INTEGER,
        'admin_id', v_admin_id,
        'from_status', v_from_status,
        'notes', NULLIF(trim(COALESCE(p_notes, '')), '')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_goods_capture(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_goods_capture(TEXT, UUID, TEXT)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_finalize_goods_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_captured_amount_cents INTEGER,
    p_admin_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
    v_auth_fee NUMERIC;
    v_goods_amount NUMERIC;
    v_expected_total_cents INTEGER;
    v_from_status TEXT;
    v_admin_id UUID;
    v_updated RECORD;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_captured_amount_cents IS NULL OR p_captured_amount_cents <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款金額異常。';
    END IF;

    v_admin_id := p_admin_id;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            COALESCE(mo.item_subtotal, mo.final_price),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_goods_amount, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_total_cents := ROUND(
            (COALESCE(v_auth_fee, 0) + COALESCE(v_goods_amount, 0)) * 100
        )::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_total_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'shipped'::public.member_escrow_status,
            auth_result = 'passed',
            auth_graded_at = now(),
            auth_graded_by = v_admin_id,
            auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            payment_capture_status = 'fully_captured'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'grading'::public.member_escrow_status
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
          AND status = 'pending'
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            COALESCE(mo.item_subtotal, mo.final_price) + COALESCE(mo.shipping_fee, 0),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_goods_amount, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_expected_total_cents := ROUND(
            (COALESCE(v_auth_fee, 0) + COALESCE(v_goods_amount, 0)) * 100
        )::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_total_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticated'::public.escrow_state,
            auth_result = 'passed',
            auth_graded_at = now(),
            auth_graded_by = v_admin_id,
            auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
            payment_capture_status = 'fully_captured'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'authenticating'::public.escrow_state
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_admin_id IS NOT NULL THEN
        PERFORM public._grading_write_audit_log(
            p_order_kind,
            p_order_id,
            v_admin_id,
            'pass_grading',
            v_from_status,
            CASE WHEN p_order_kind = 'member' THEN 'shipped' ELSE 'authenticated' END,
            NULLIF(trim(COALESCE(p_notes, '')), '')
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'payment_capture_status', 'fully_captured',
        'order', to_jsonb(v_updated)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_goods_capture(TEXT, UUID, TEXT, INTEGER, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_goods_capture(TEXT, UUID, TEXT, INTEGER, UUID, TEXT)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Grading fail void prepare / finalize
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_grading_fail(
    p_order_kind TEXT,
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_pi TEXT;
    v_capture_status public.payment_capture_status;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_fault_party IS NULL THEN
        RAISE EXCEPTION '請選擇責任方（fault_party）。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.escrow_status = 'grading'::public.member_escrow_status
              AND mo.status = 'pending'
              AND mo.auth_result IS NULL
        ) THEN
            RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
        END IF;

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_status IS DISTINCT FROM 'auth_fee_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.escrow_status = 'authenticating'::public.escrow_state
              AND mo.auth_result IS NULL
        ) THEN
            RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
        END IF;

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '訂單缺少有效付款憑證，無法釋放餘額。';
    END IF;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'prepare_fail_void',
        v_from_status,
        NULL,
        p_fault_party::TEXT
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'admin_id', v_admin_id,
        'fault_party', p_fault_party::TEXT
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_auth_grading_fail(TEXT, UUID, public.grading_fault_party, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_auth_grading_fail(TEXT, UUID, public.grading_fault_party, TEXT)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_grading_fail(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_from_status TEXT;
    v_fault_party public.grading_fault_party;
    v_updated RECORD;
    v_admin_id UUID;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party
        INTO v_from_status, v_listing_id, v_fault_party
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.auth_result = 'failed'
              AND mo.escrow_status = 'cancelled'::public.member_escrow_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'cancelled'::public.member_escrow_status,
            status = 'cancelled',
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party
        INTO v_from_status, v_listing_id, v_fault_party
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
          AND mo.stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.auth_result = 'failed'
              AND mo.escrow_status = 'refunded'::public.escrow_state
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'refunded'::public.escrow_state,
            auth_result = 'failed',
            auth_graded_at = now(),
            refund_status = 'none',
            refund_error = NULL,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    SELECT gal.admin_id
    INTO v_admin_id
    FROM public.grading_audit_logs gal
    WHERE gal.order_kind = p_order_kind
      AND gal.order_id = p_order_id
      AND gal.action = 'prepare_fail_void'
    ORDER BY gal.created_at DESC
    LIMIT 1;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        COALESCE(v_admin_id, auth.uid()),
        'fail_grading_void',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'cancelled' ELSE 'refunded' END,
        COALESCE(v_fault_party::TEXT, '')
    );

    RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_updated));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_auth_grading_fail(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_auth_grading_fail(TEXT, UUID, TEXT)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_mark_auth_grading_fail_failed(
    p_order_kind TEXT,
    p_order_id UUID,
    p_error TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_order_kind = 'member' THEN
        UPDATE public.member_orders
        SET
            refund_status = 'failed',
            refund_error = NULLIF(trim(COALESCE(p_error, '')), ''),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing';
    ELSIF p_order_kind = 'merchant' THEN
        UPDATE public.merchant_orders
        SET
            refund_status = 'failed',
            refund_error = NULLIF(trim(COALESCE(p_error, '')), ''),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing';
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_auth_grading_fail_failed(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_auth_grading_fail_failed(TEXT, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Fix void webhook RPC (do not overwrite auth_fee_captured)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_mark_auth_order_payment_voided(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT payment_capture_status
        INTO v_capture_status
        FROM public.member_orders
        WHERE id = p_order_id
          AND use_authentication = true
          AND stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status,
            'voided'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        UPDATE public.member_orders
        SET
            payment_capture_status = 'voided'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id;

        RETURN jsonb_build_object('success', true, 'already_applied', false);
    ELSIF p_order_kind = 'merchant' THEN
        SELECT payment_capture_status
        INTO v_capture_status
        FROM public.merchant_orders
        WHERE id = p_order_id
          AND requires_authentication = true
          AND stripe_payment_intent_id = p_payment_intent_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status,
            'voided'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RETURN jsonb_build_object('success', true, 'skipped', true);
        END IF;

        UPDATE public.merchant_orders
        SET
            payment_capture_status = 'voided'::public.payment_capture_status,
            updated_at = now()
        WHERE id = p_order_id;

        RETURN jsonb_build_object('success', true, 'already_applied', false);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Downstream guards: fully_captured required for receipt / payout
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
        AND payment_capture_status = 'fully_captured'::public.payment_capture_status
        AND outbound_tracking_no IS NOT NULL
        AND btrim(outbound_tracking_no) <> '';

    IF NOT FOUND THEN
        RAISE EXCEPTION '確認收貨失敗：訂單狀態不合法、鑑定未通過、款項未全額扣款或尚未出庫。';
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
    v_payment_capture_status public.payment_capture_status;
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
        mo.payment_capture_status,
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
        v_payment_capture_status,
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
           OR btrim(v_outbound_tracking) = ''
           OR v_payment_capture_status IS DISTINCT FROM 'fully_captured'::public.payment_capture_status THEN
            RAISE EXCEPTION '鑑定訂單尚未通過鑑定、款項未全額扣款或尚未出庫，無法確認收貨。';
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
