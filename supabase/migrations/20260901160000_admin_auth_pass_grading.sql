-- Admin auth pass grading: persist platform grading on pass + require on goods capture RPCs.

ALTER TABLE public.member_orders
    ADD COLUMN IF NOT EXISTS auth_grading_company TEXT,
    ADD COLUMN IF NOT EXISTS auth_grading_score TEXT;

ALTER TABLE public.merchant_orders
    ADD COLUMN IF NOT EXISTS auth_grading_company TEXT,
    ADD COLUMN IF NOT EXISTS auth_grading_score TEXT;

DROP FUNCTION IF EXISTS public.rpc_prepare_goods_capture(TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_prepare_goods_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_notes TEXT DEFAULT NULL,
    p_auth_grading_company TEXT DEFAULT NULL,
    p_auth_grading_score TEXT DEFAULT NULL
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
    v_capture_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_from_status TEXT;
    v_capture_model TEXT;
    v_grading_company TEXT;
    v_grading_score TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    v_grading_company := NULLIF(trim(COALESCE(p_auth_grading_company, '')), '');
    v_grading_score := NULLIF(trim(COALESCE(p_auth_grading_score, '')), '');

    IF v_grading_company IS NULL THEN
        RAISE EXCEPTION '請選擇鑑定等級。';
    END IF;

    IF upper(v_grading_company) = 'RAW' THEN
        RAISE EXCEPTION '鑑定通過不可選擇裸卡等級。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            CASE
                WHEN mo.escrow_capture_model = 'single' THEN
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                ELSE
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                        - COALESCE(mo.auth_fee, 0)
                        - COALESCE(mo.inbound_shipping_fee, 0)
            END,
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_capture_model, v_buyer_total, v_capture_amount, v_from_status
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
                'goods_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'capture_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id,
                'escrow_capture_model', v_capture_model
            );
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成授權付款。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.member_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'grading'::public.member_escrow_status
                  AND mo.status = 'pending'
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
            END IF;
        ELSE
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
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            CASE
                WHEN mo.escrow_capture_model = 'single' THEN
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                ELSE
                    COALESCE(mo.buyer_total_amount, mo.total_amount)
                        - COALESCE(mo.auth_fee, 0)
                        - COALESCE(mo.inbound_shipping_fee, 0)
            END,
            mo.escrow_status::TEXT
        INTO v_pi, v_capture_status, v_capture_model, v_buyer_total, v_capture_amount, v_from_status
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
                'goods_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'capture_cents', ROUND(COALESCE(v_capture_amount, 0) * 100)::INTEGER,
                'admin_id', v_admin_id,
                'escrow_capture_model', v_capture_model
            );
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定通過扣款失敗：訂單尚未完成授權付款。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
            END IF;
        ELSE
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
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_pi IS NULL OR btrim(v_pi) = '' THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：找不到 Stripe PaymentIntent。';
    END IF;

    IF COALESCE(v_capture_amount, 0) <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款失敗：扣款金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'already_applied', false,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'goods_cents', ROUND(v_capture_amount * 100)::INTEGER,
        'capture_cents', ROUND(v_capture_amount * 100)::INTEGER,
        'admin_id', v_admin_id,
        'from_status', v_from_status,
        'notes', NULLIF(trim(COALESCE(p_notes, '')), ''),
        'escrow_capture_model', v_capture_model,
        'auth_grading_company', v_grading_company,
        'auth_grading_score', v_grading_score
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_prepare_goods_capture(TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_goods_capture(TEXT, UUID, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.rpc_finalize_goods_capture(TEXT, UUID, TEXT, INTEGER, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_finalize_goods_capture(
    p_order_kind TEXT,
    p_order_id UUID,
    p_payment_intent_id TEXT,
    p_captured_amount_cents INTEGER,
    p_admin_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_auth_grading_company TEXT DEFAULT NULL,
    p_auth_grading_score TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capture_status public.payment_capture_status;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_goods_amount NUMERIC;
    v_buyer_total NUMERIC;
    v_expected_cents INTEGER;
    v_from_status TEXT;
    v_admin_id UUID;
    v_capture_model TEXT;
    v_grading_company TEXT;
    v_grading_score TEXT;
    v_updated RECORD;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_captured_amount_cents IS NULL OR p_captured_amount_cents <= 0 THEN
        RAISE EXCEPTION '鑑定通過扣款金額異常。';
    END IF;

    v_admin_id := p_admin_id;
    v_grading_company := NULLIF(trim(COALESCE(p_auth_grading_company, '')), '');
    v_grading_score := NULLIF(trim(COALESCE(p_auth_grading_score, '')), '');

    IF p_order_kind = 'member' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_capture_model, v_goods_amount, v_buyer_total, v_from_status
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF v_grading_company IS NULL THEN
            RAISE EXCEPTION '請選擇鑑定等級。';
        END IF;

        IF upper(v_grading_company) = 'RAW' THEN
            RAISE EXCEPTION '鑑定通過不可選擇裸卡等級。';
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        IF v_capture_model IS DISTINCT FROM 'single' THEN
            IF COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0) + COALESCE(v_goods_amount, 0)
               IS DISTINCT FROM COALESCE(v_buyer_total, 0) THEN
                RAISE EXCEPTION '鑑定通過扣款金額與買家實付不符。';
            END IF;
        END IF;

        IF v_capture_model = 'single' THEN
            UPDATE public.member_orders
            SET
                escrow_status = 'shipped'::public.member_escrow_status,
                auth_result = 'passed',
                auth_graded_at = now(),
                auth_graded_by = v_admin_id,
                auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
                auth_grading_company = v_grading_company,
                auth_grading_score = v_grading_score,
                payment_capture_status = 'fully_captured'::public.payment_capture_status,
                updated_at = now()
            WHERE id = p_order_id
              AND use_authentication = true
              AND escrow_capture_model = 'single'
              AND escrow_status = 'grading'::public.member_escrow_status
              AND payment_capture_status = 'authorized'::public.payment_capture_status
              AND status = 'pending'
            RETURNING * INTO v_updated;
        ELSE
            UPDATE public.member_orders
            SET
                escrow_status = 'shipped'::public.member_escrow_status,
                auth_result = 'passed',
                auth_graded_at = now(),
                auth_graded_by = v_admin_id,
                auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
                auth_grading_company = v_grading_company,
                auth_grading_score = v_grading_score,
                payment_capture_status = 'fully_captured'::public.payment_capture_status,
                updated_at = now()
            WHERE id = p_order_id
              AND use_authentication = true
              AND escrow_status = 'grading'::public.member_escrow_status
              AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              AND status = 'pending'
            RETURNING * INTO v_updated;
        END IF;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定通過失敗：訂單狀態不合法。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.payment_capture_status,
            mo.auth_fee,
            mo.inbound_shipping_fee,
            mo.escrow_capture_model,
            COALESCE(mo.buyer_total_amount, mo.total_amount)
                - COALESCE(mo.auth_fee, 0)
                - COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount),
            mo.escrow_status::TEXT
        INTO v_capture_status, v_auth_fee, v_inbound, v_capture_model, v_goods_amount, v_buyer_total, v_from_status
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        v_expected_cents := ROUND(COALESCE(v_buyer_total, 0) * 100)::INTEGER;

        IF v_capture_status = 'fully_captured'::public.payment_capture_status THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_applied', true,
                'payment_capture_status', v_capture_status
            );
        END IF;

        IF v_grading_company IS NULL THEN
            RAISE EXCEPTION '請選擇鑑定等級。';
        END IF;

        IF upper(v_grading_company) = 'RAW' THEN
            RAISE EXCEPTION '鑑定通過不可選擇裸卡等級。';
        END IF;

        IF p_captured_amount_cents <> v_expected_cents THEN
            RAISE EXCEPTION '鑑定通過扣款金額與訂單總額不符。';
        END IF;

        IF v_capture_model IS DISTINCT FROM 'single' THEN
            IF COALESCE(v_auth_fee, 0) + COALESCE(v_inbound, 0) + COALESCE(v_goods_amount, 0)
               IS DISTINCT FROM COALESCE(v_buyer_total, 0) THEN
                RAISE EXCEPTION '鑑定通過扣款金額與買家實付不符。';
            END IF;
        END IF;

        IF v_capture_model = 'single' THEN
            UPDATE public.merchant_orders
            SET
                escrow_status = 'authenticated'::public.escrow_state,
                auth_result = 'passed',
                auth_graded_at = now(),
                auth_graded_by = v_admin_id,
                auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
                auth_grading_company = v_grading_company,
                auth_grading_score = v_grading_score,
                payment_capture_status = 'fully_captured'::public.payment_capture_status,
                updated_at = now()
            WHERE id = p_order_id
              AND requires_authentication = true
              AND escrow_capture_model = 'single'
              AND escrow_status = 'authenticating'::public.escrow_state
              AND payment_capture_status = 'authorized'::public.payment_capture_status
            RETURNING * INTO v_updated;
        ELSE
            UPDATE public.merchant_orders
            SET
                escrow_status = 'authenticated'::public.escrow_state,
                auth_result = 'passed',
                auth_graded_at = now(),
                auth_graded_by = v_admin_id,
                auth_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
                auth_grading_company = v_grading_company,
                auth_grading_score = v_grading_score,
                payment_capture_status = 'fully_captured'::public.payment_capture_status,
                updated_at = now()
            WHERE id = p_order_id
              AND requires_authentication = true
              AND escrow_status = 'authenticating'::public.escrow_state
              AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
            RETURNING * INTO v_updated;
        END IF;

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

REVOKE ALL ON FUNCTION public.rpc_finalize_goods_capture(TEXT, UUID, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_goods_capture(TEXT, UUID, TEXT, INTEGER, UUID, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

-- Extend admin grading search with platform auth grading result.
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
            mo.auth_grading_company,
            mo.auth_grading_score,
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
            mo.auth_grading_company,
            mo.auth_grading_score,
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
    SELECT
        (SELECT COUNT(*)::BIGINT FROM filtered),
        COALESCE((
            SELECT jsonb_agg(to_jsonb(f) ORDER BY f.updated_at DESC NULLS LAST, f.created_at DESC)
            FROM (
                SELECT * FROM filtered
                ORDER BY updated_at DESC NULLS LAST, created_at DESC
                LIMIT v_limit OFFSET v_offset
            ) f
        ), '[]'::JSONB)
    INTO v_total, v_rows;

    RETURN jsonb_build_object(
        'rows', v_rows,
        'total', v_total,
        'page', GREATEST(COALESCE(p_page, 1), 1),
        'page_size', v_limit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_admin_grading_orders(TEXT, TEXT, TEXT, INTEGER, INTEGER)
    TO authenticated, service_role;
