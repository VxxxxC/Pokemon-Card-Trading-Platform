-- Escrow P0: manual capture for authentication orders, payment_capture_status,
-- authorize webhook RPCs, auth-fee partial capture on admin intake, grading cancel lock.

-- ---------------------------------------------------------------------------
-- 1. payment_capture_status enum + columns
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'payment_capture_status' AND n.nspname = 'public'
    ) THEN
        CREATE TYPE public.payment_capture_status AS ENUM (
            'none',
            'authorized',
            'auth_fee_captured',
            'fully_captured',
            'voided',
            'refunded',
            'partially_refunded'
        );
    END IF;
END;
$$;

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS payment_capture_status public.payment_capture_status NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS auth_fee_captured_at TIMESTAMPTZ;

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS payment_capture_status public.payment_capture_status NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS auth_fee_captured_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Authorize RPCs (webhook: payment_intent.amount_capturable_updated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_mark_member_auth_order_authorized(
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_amounts JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escrow_status public.member_escrow_status;
    v_use_auth BOOLEAN;
    v_capture_status public.payment_capture_status;
    v_existing_pi TEXT;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT escrow_status, use_authentication, payment_capture_status, stripe_payment_intent_id
    INTO v_escrow_status, v_use_auth, v_capture_status, v_existing_pi
    FROM public.member_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的會員訂單。';
    END IF;

    IF NOT COALESCE(v_use_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定託管流程。';
    END IF;

    IF v_existing_pi IS NOT NULL AND v_existing_pi <> p_payment_intent_id THEN
        RAISE EXCEPTION '付款憑證與訂單不符，已攔截入帳。';
    END IF;

    IF v_capture_status IN (
        'authorized'::public.payment_capture_status,
        'auth_fee_captured'::public.payment_capture_status,
        'fully_captured'::public.payment_capture_status
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'payment'::public.member_escrow_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    UPDATE public.member_orders
    SET
        escrow_status = 'custody'::public.member_escrow_status,
        stripe_payment_intent_id = p_payment_intent_id,
        payment_capture_status = 'authorized'::public.payment_capture_status,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        total_amount = COALESCE((p_amounts ->> 'total_amount')::NUMERIC, total_amount, final_price),
        payment_confirmed_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'custody',
        'payment_capture_status', 'authorized'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_member_auth_order_authorized(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_member_auth_order_authorized(UUID, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_mark_merchant_order_authorized(
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_amounts JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_escrow_status public.escrow_state;
    v_requires_auth BOOLEAN;
    v_capture_status public.payment_capture_status;
    v_existing_pi TEXT;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    SELECT escrow_status, requires_authentication, payment_capture_status, stripe_payment_intent_id
    INTO v_escrow_status, v_requires_auth, v_capture_status, v_existing_pi
    FROM public.merchant_orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '找不到指定的商戶訂單。';
    END IF;

    IF NOT COALESCE(v_requires_auth, false) THEN
        RAISE EXCEPTION '此訂單非鑑定商戶流程。';
    END IF;

    IF v_existing_pi IS NOT NULL AND v_existing_pi <> p_payment_intent_id THEN
        RAISE EXCEPTION '付款憑證與訂單不符，已攔截入帳。';
    END IF;

    IF v_capture_status IN (
        'authorized'::public.payment_capture_status,
        'auth_fee_captured'::public.payment_capture_status,
        'fully_captured'::public.payment_capture_status
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    IF v_escrow_status IS DISTINCT FROM 'pending_payment'::public.escrow_state THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_applied', true,
            'escrow_status', v_escrow_status,
            'payment_capture_status', v_capture_status
        );
    END IF;

    UPDATE public.merchant_orders
    SET
        escrow_status = 'payment_held'::public.escrow_state,
        stripe_payment_intent_id = p_payment_intent_id,
        payment_capture_status = 'authorized'::public.payment_capture_status,
        item_subtotal = COALESCE((p_amounts ->> 'item_subtotal')::NUMERIC, item_subtotal, final_price),
        shipping_fee = COALESCE((p_amounts ->> 'shipping_fee')::NUMERIC, shipping_fee, 0),
        auth_fee = COALESCE((p_amounts ->> 'auth_fee')::NUMERIC, auth_fee, 0),
        shipping_method = COALESCE(p_amounts ->> 'shipping_method', shipping_method),
        total_amount = COALESCE((p_amounts ->> 'total_amount')::NUMERIC, total_amount, final_price),
        paid_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'escrow_status', 'payment_held',
        'payment_capture_status', 'authorized'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_merchant_order_authorized(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_merchant_order_authorized(UUID, TEXT, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Auth-fee capture prepare / finalize (admin intake saga)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_fee_capture(
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
    v_pi TEXT;
    v_auth_fee NUMERIC;
    v_capture_status public.payment_capture_status;
    v_from_status TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.auth_fee,
            mo.payment_capture_status,
            mo.escrow_status::TEXT
        INTO v_pi, v_auth_fee, v_capture_status, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_status = 'auth_fee_captured'::public.payment_capture_status
           OR v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'auth_fee_cents', ROUND(COALESCE(v_auth_fee, 0) * 100)::INTEGER,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RAISE EXCEPTION '入庫扣款失敗：訂單尚未完成授權付款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.member_orders mo
            WHERE mo.id = p_order_id
              AND mo.inbound_tracking_no IS NOT NULL
              AND btrim(mo.inbound_tracking_no) <> ''
              AND mo.platform_received_at IS NULL
              AND mo.escrow_status = 'custody'::public.member_escrow_status
              AND mo.status = 'pending'
        ) THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.auth_fee,
            mo.payment_capture_status,
            mo.escrow_status::TEXT
        INTO v_pi, v_auth_fee, v_capture_status, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_status = 'auth_fee_captured'::public.payment_capture_status
           OR v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'order_kind', p_order_kind,
                'order_id', p_order_id,
                'payment_intent_id', v_pi,
                'auth_fee_cents', ROUND(COALESCE(v_auth_fee, 0) * 100)::INTEGER,
                'admin_id', v_admin_id
            );
        END IF;

        IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
            RAISE EXCEPTION '入庫扣款失敗：訂單尚未完成授權付款。';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.merchant_orders mo
            WHERE mo.id = p_order_id
              AND mo.inbound_tracking_no IS NOT NULL
              AND btrim(mo.inbound_tracking_no) <> ''
              AND mo.platform_received_at IS NULL
              AND mo.escrow_status = 'payment_held'::public.escrow_state
        ) THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法或尚未提交入庫物流。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '入庫扣款失敗：找不到 Stripe PaymentIntent。';
    END IF;

    IF COALESCE(v_auth_fee, 0) <= 0 THEN
        RAISE EXCEPTION '入庫扣款失敗：鑑定費金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'auth_fee_cents', ROUND(v_auth_fee * 100)::INTEGER,
        'admin_id', v_admin_id,
        'from_status', v_from_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_auth_fee_capture(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_auth_fee_capture(TEXT, UUID)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_finalize_auth_fee_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_captured_amount_cents INTEGER,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
    v_auth_fee NUMERIC;
    v_expected_cents INTEGER;
    v_from_status TEXT;
    v_admin_id UUID;
    v_updated RECORD;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_captured_amount_cents IS NULL OR p_captured_amount_cents <= 0 THEN
        RAISE EXCEPTION '入庫扣款金額異常。';
    END IF;

    v_admin_id := p_admin_id;

    IF p_order_kind = 'member' THEN
        SELECT mo.payment_capture_status, mo.auth_fee, mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(COALESCE(v_auth_fee, 0) * 100)::INTEGER;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '入庫扣款金額與鑑定費不符。';
        END IF;

        UPDATE public.member_orders
        SET
            escrow_status = 'grading'::public.member_escrow_status,
            platform_received_at = now(),
            payment_capture_status = 'auth_fee_captured'::public.payment_capture_status,
            auth_fee_captured_at = now(),
            updated_at = now()
        WHERE id = p_order_id
          AND use_authentication = true
          AND escrow_status = 'custody'::public.member_escrow_status
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND platform_received_at IS NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT mo.payment_capture_status, mo.auth_fee, mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(COALESCE(v_auth_fee, 0) * 100)::INTEGER;

        IF v_capture_status IN (
            'auth_fee_captured'::public.payment_capture_status,
            'fully_captured'::public.payment_capture_status
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '入庫扣款金額與鑑定費不符。';
        END IF;

        UPDATE public.merchant_orders
        SET
            escrow_status = 'authenticating'::public.escrow_state,
            platform_received_at = now(),
            payment_capture_status = 'auth_fee_captured'::public.payment_capture_status,
            auth_fee_captured_at = now(),
            updated_at = now()
        WHERE id = p_order_id
          AND requires_authentication = true
          AND escrow_status = 'payment_held'::public.escrow_state
          AND payment_capture_status = 'authorized'::public.payment_capture_status
          AND platform_received_at IS NULL
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '入庫確認失敗：訂單狀態不合法。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_admin_id IS NOT NULL THEN
        PERFORM public._grading_write_audit_log(
            p_order_kind,
            p_order_id,
            v_admin_id,
            'confirm_intake',
            v_from_status,
            CASE WHEN p_order_kind = 'member' THEN 'grading' ELSE 'authenticating' END,
            NULL
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'payment_capture_status', 'auth_fee_captured',
        'order', to_jsonb(v_updated)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalize_auth_fee_capture(TEXT, UUID, TEXT, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_auth_fee_capture(TEXT, UUID, TEXT, INTEGER, UUID)
    TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Void sync (webhook: payment_intent.canceled)
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

        IF v_capture_status = 'voided'::public.payment_capture_status THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
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

        IF v_capture_status = 'voided'::public.payment_capture_status THEN
            RETURN jsonb_build_object('success', true, 'already_applied', true);
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

REVOKE ALL ON FUNCTION public.rpc_mark_auth_order_payment_voided(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_auth_order_payment_voided(TEXT, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Cancel guard during grading lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_cancel_member_order(
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_listing_id UUID;
    v_room_id UUID;
    v_message_id UUID;
    v_use_auth BOOLEAN;
    v_escrow_status public.member_escrow_status;
    v_capture_status public.payment_capture_status;
    v_platform_received_at TIMESTAMPTZ;
BEGIN
    SELECT
        listing_id,
        use_authentication,
        escrow_status,
        payment_capture_status,
        platform_received_at
    INTO
        v_listing_id,
        v_use_auth,
        v_escrow_status,
        v_capture_status,
        v_platform_received_at
    FROM public.member_orders
    WHERE id = p_order_id AND seller_id = p_user_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION '取消失敗：訂單狀態不合法，或您非此筆交易的賣家。';
    END IF;

    IF COALESCE(v_use_auth, false) THEN
        IF v_platform_received_at IS NOT NULL
           OR v_escrow_status IN (
               'grading'::public.member_escrow_status,
               'shipped'::public.member_escrow_status
           )
           OR v_capture_status IN (
               'auth_fee_captured'::public.payment_capture_status,
               'fully_captured'::public.payment_capture_status
           ) THEN
            RAISE EXCEPTION '取消失敗：鑑定期間不可取消訂單。';
        END IF;
    END IF;

    UPDATE public.member_orders
    SET
        status = 'cancelled',
        escrow_status = CASE
            WHEN use_authentication AND escrow_status IS NOT NULL THEN 'cancelled'::public.member_escrow_status
            ELSE escrow_status
        END,
        payment_capture_status = CASE
            WHEN use_authentication
                 AND payment_capture_status = 'authorized'::public.payment_capture_status
            THEN 'voided'::public.payment_capture_status
            ELSE payment_capture_status
        END,
        updated_at = now()
    WHERE id = p_order_id;

    UPDATE public.listings SET status = 'active' WHERE id = v_listing_id;

    SELECT id INTO v_room_id FROM public.chat_rooms
    WHERE buyer_id = (SELECT buyer_id FROM public.member_orders WHERE id = p_order_id)
      AND seller_id = p_user_id;

    IF FOUND THEN
        INSERT INTO public.chat_messages (room_id, sender_id, content, member_order_id, is_system_warning)
        VALUES (v_room_id, p_user_id, 'SYSTEM_ORDER_CANCELLED', p_order_id, true)
        RETURNING id INTO v_message_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cancel_member_order(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_member_order(UUID, UUID) TO authenticated, service_role;
