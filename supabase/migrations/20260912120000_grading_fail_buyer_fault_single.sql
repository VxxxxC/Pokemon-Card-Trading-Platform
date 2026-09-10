-- PR2: Single-capture grading fail — buyer fault retains auth_fee (capture D, release A+B+C).
-- Restores seller-fault settlement in rpc_finalize_auth_grading_fail (regression from coupon migration).
-- Extends search_admin_grading_orders for admin fail preview fields.

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
    v_capture_model TEXT;
    v_void_mode TEXT;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_buyer_total NUMERIC;
    v_refund_cents INTEGER;
    v_capture_cents INTEGER := 0;
    v_settlement_required BOOLEAN;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_fault_party IS NULL THEN
        RAISE EXCEPTION '請選擇責任方（fault_party）。';
    END IF;

    v_settlement_required := p_fault_party = 'seller'::public.grading_fault_party;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.stripe_payment_intent_id,
            mo.payment_capture_status,
            mo.escrow_status::TEXT,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0)
        INTO v_pi, v_capture_status, v_from_status, v_capture_model, v_auth_fee, v_inbound, v_buyer_total
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
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
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            IF p_fault_party = 'buyer'::public.grading_fault_party THEN
                IF v_auth_fee <= 0 THEN
                    RAISE EXCEPTION '鑑定費不可為零，無法執行買家責任扣款。';
                END IF;
                v_void_mode := 'capture_auth_fee_only';
                v_capture_cents := ROUND(v_auth_fee * 100)::INTEGER;
                IF v_capture_cents > ROUND(v_buyer_total * 100)::INTEGER THEN
                    RAISE EXCEPTION '鑑定費超過買家授權總額。';
                END IF;
            ELSE
                v_void_mode := 'cancel';
            END IF;
        ELSE
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

            v_void_mode := 'capture_zero';
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
            mo.escrow_status::TEXT,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0)
        INTO v_pi, v_capture_status, v_from_status, v_capture_model, v_auth_fee, v_inbound, v_buyer_total
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true
        FOR UPDATE OF mo;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;

        IF v_capture_model = 'single' THEN
            IF v_capture_status IS DISTINCT FROM 'authorized'::public.payment_capture_status THEN
                RAISE EXCEPTION '鑑定失敗處理失敗：訂單付款狀態不合法。';
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM public.merchant_orders mo
                WHERE mo.id = p_order_id
                  AND mo.platform_received_at IS NOT NULL
                  AND mo.escrow_status = 'authenticating'::public.escrow_state
                  AND mo.auth_result IS NULL
            ) THEN
                RAISE EXCEPTION '僅鑑定中的訂單可標記失敗。';
            END IF;

            IF p_fault_party = 'buyer'::public.grading_fault_party THEN
                IF v_auth_fee <= 0 THEN
                    RAISE EXCEPTION '鑑定費不可為零，無法執行買家責任扣款。';
                END IF;
                v_void_mode := 'capture_auth_fee_only';
                v_capture_cents := ROUND(v_auth_fee * 100)::INTEGER;
                IF v_capture_cents > ROUND(v_buyer_total * 100)::INTEGER THEN
                    RAISE EXCEPTION '鑑定費超過買家授權總額。';
                END IF;
            ELSE
                v_void_mode := 'cancel';
            END IF;
        ELSE
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

            v_void_mode := 'capture_zero';
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

    v_refund_cents := CASE
        WHEN v_settlement_required AND v_capture_model IS DISTINCT FROM 'single'
            THEN ROUND((v_auth_fee + v_inbound) * 100)::INTEGER
        ELSE 0
    END;

    PERFORM public._grading_write_audit_log(
        p_order_kind,
        p_order_id,
        v_admin_id,
        'prepare_fail_void',
        v_from_status,
        CASE WHEN p_order_kind = 'member' THEN 'grading' ELSE 'authenticating' END,
        NULLIF(trim(COALESCE(p_reason, '')), '')
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_kind', p_order_kind,
        'order_id', p_order_id,
        'payment_intent_id', v_pi,
        'admin_id', v_admin_id,
        'fault_party', p_fault_party,
        'escrow_capture_model', v_capture_model,
        'void_mode', v_void_mode,
        'settlement_required', v_settlement_required,
        'refund_cents', v_refund_cents,
        'capture_cents', v_capture_cents
    );
END;
$$;

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
    v_liability JSONB := NULL;
    v_amount_hkd NUMERIC;
    v_stripe_fee NUMERIC;
    v_seller_id UUID;
    v_merchant_id UUID;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION '缺少 PaymentIntent 識別碼。';
    END IF;

    IF p_order_kind = 'member' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party,
            mo.seller_id
        INTO v_from_status, v_listing_id, v_fault_party, v_seller_id
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
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single'
                     AND fault_party = 'buyer'::public.grading_fault_party
                    THEN 'auth_fee_captured'::public.payment_capture_status
                WHEN escrow_capture_model = 'single'
                    THEN 'voided'::public.payment_capture_status
                ELSE payment_capture_status
            END,
            seller_settlement_status = CASE
                WHEN fault_party = 'seller'::public.grading_fault_party
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status = 'authorized'::public.payment_capture_status
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.escrow_status::TEXT,
            mo.listing_id,
            mo.fault_party,
            mo.merchant_id
        INTO v_from_status, v_listing_id, v_fault_party, v_merchant_id
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
            payment_capture_status = CASE
                WHEN escrow_capture_model = 'single'
                     AND fault_party = 'buyer'::public.grading_fault_party
                    THEN 'auth_fee_captured'::public.payment_capture_status
                WHEN escrow_capture_model = 'single'
                    THEN 'voided'::public.payment_capture_status
                ELSE payment_capture_status
            END,
            seller_settlement_status = CASE
                WHEN fault_party = 'seller'::public.grading_fault_party
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status = 'authorized'::public.payment_capture_status
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    IF v_fault_party = 'seller'::public.grading_fault_party THEN
        v_liability := public.fn_compute_seller_grading_fail_liability(p_order_kind, p_order_id);
        v_amount_hkd := (v_liability->>'amount_hkd')::NUMERIC;
        v_stripe_fee := COALESCE((v_liability->>'stripe_fee_hkd')::NUMERIC, 0);

        IF p_order_kind = 'member' THEN
            INSERT INTO public.seller_receivables (
                order_kind,
                order_id,
                seller_id,
                amount_hkd,
                stripe_fee_hkd,
                status
            )
            VALUES (
                p_order_kind,
                p_order_id,
                v_seller_id,
                v_amount_hkd,
                NULLIF(v_stripe_fee, 0),
                'pending'::public.seller_receivable_status
            )
            ON CONFLICT (order_kind, order_id) DO NOTHING;
        ELSE
            INSERT INTO public.merchant_ledgers (
                merchant_id,
                order_id,
                amount,
                transaction_type
            )
            VALUES (
                v_merchant_id,
                p_order_id,
                -1 * v_amount_hkd,
                'grading_fail_recovery'::public.transaction_type
            )
            ON CONFLICT (order_id, transaction_type)
                WHERE order_id IS NOT NULL
            DO NOTHING;
        END IF;
    END IF;

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

    RETURN jsonb_build_object(
        'success', true,
        'order', to_jsonb(v_updated),
        'liability', v_liability
    );
END;
$$;

-- search_admin_grading_orders: expose capture model + shipping breakdown for fail preview
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
            COALESCE(mo.inbound_shipping_fee, 0) + COALESCE(mo.outbound_shipping_fee, 0) AS shipping_fee,
            mo.auth_fee,
            mo.total_amount,
            mo.buyer_total_amount,
            mo.inbound_shipping_fee,
            mo.outbound_shipping_fee,
            mo.escrow_capture_model,
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
            mo.fault_party::TEXT AS fault_party,
            mo.seller_settlement_status::TEXT AS seller_settlement_status,
            sr.amount_hkd AS receivable_amount_hkd,
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
        LEFT JOIN public.seller_receivables sr
            ON sr.order_kind = 'member'
           AND sr.order_id = mo.id
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
            mo.buyer_total_amount,
            mo.inbound_shipping_fee,
            mo.outbound_shipping_fee,
            mo.escrow_capture_model,
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
            mo.fault_party::TEXT AS fault_party,
            mo.seller_settlement_status::TEXT AS seller_settlement_status,
            (
                SELECT ABS(ml.amount)
                FROM public.merchant_ledgers ml
                WHERE ml.order_id = mo.id
                  AND ml.transaction_type = 'grading_fail_recovery'::public.transaction_type
                LIMIT 1
            ) AS receivable_amount_hkd,
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
            OR (p_tab = 'awaiting_settlement' AND (
                u.auth_result = 'failed'
                AND u.fault_party = 'seller'
                AND (
                    u.seller_settlement_status = 'pending'
                    OR (
                        u.seller_settlement_status = 'cleared'
                        AND (u.outbound_tracking_no IS NULL OR btrim(u.outbound_tracking_no) = '')
                    )
                )
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
