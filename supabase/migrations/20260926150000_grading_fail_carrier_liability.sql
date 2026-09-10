-- Grading fail carrier liability + legacy carrier(seller) settlement.

DROP FUNCTION IF EXISTS public.rpc_prepare_auth_grading_fail(
    TEXT, UUID, public.grading_fault_party, TEXT
);

CREATE OR REPLACE FUNCTION public.rpc_prepare_auth_grading_fail(
    p_order_kind TEXT,
    p_order_id UUID,
    p_fault_party public.grading_fault_party,
    p_reason TEXT DEFAULT NULL,
    p_carrier_liability_party TEXT DEFAULT NULL
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
    v_notes TEXT;
    v_carrier_liability TEXT;
BEGIN
    v_admin_id := public._grading_require_admin();

    IF p_fault_party IS NULL THEN
        RAISE EXCEPTION '請選擇責任方（fault_party）。';
    END IF;

    v_carrier_liability := lower(btrim(COALESCE(p_carrier_liability_party, '')));

    IF p_fault_party = 'carrier'::public.grading_fault_party THEN
        IF v_carrier_liability NOT IN ('seller', 'platform') THEN
            RAISE EXCEPTION 'carrier 責任必須指定 carrier_liability_party (seller | platform)';
        END IF;
    END IF;

    v_settlement_required :=
        p_fault_party = 'seller'::public.grading_fault_party
        OR (
            p_fault_party = 'carrier'::public.grading_fault_party
            AND v_carrier_liability = 'seller'
        );

    v_notes := NULLIF(btrim(COALESCE(p_reason, '')), '');
    IF p_fault_party = 'carrier'::public.grading_fault_party
       AND v_carrier_liability IN ('seller', 'platform') THEN
        v_notes := COALESCE(v_notes || E'\n', '') || 'carrier_liability: ' || v_carrier_liability;
    END IF;

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

        PERFORM set_config('grading.order_fail', 'on', true);

        UPDATE public.member_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(v_notes, auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            PERFORM set_config('grading.order_fail', 'off', true);
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;

        PERFORM set_config('grading.order_fail', 'off', true);
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

        PERFORM set_config('grading.order_fail', 'on', true);

        UPDATE public.merchant_orders
        SET
            refund_status = 'processing',
            fault_party = p_fault_party,
            auth_notes = COALESCE(v_notes, auth_notes),
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status IN ('none', 'failed');

        IF NOT FOUND THEN
            PERFORM set_config('grading.order_fail', 'off', true);
            RAISE EXCEPTION '鑑定失敗處理已在進行中或已完成。';
        END IF;

        PERFORM set_config('grading.order_fail', 'off', true);
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

REVOKE ALL ON FUNCTION public.rpc_prepare_auth_grading_fail(
    TEXT, UUID, public.grading_fault_party, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_prepare_auth_grading_fail(
    TEXT, UUID, public.grading_fault_party, TEXT, TEXT
) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.fn_compute_seller_grading_fail_liability(
    p_order_kind TEXT,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fault_party public.grading_fault_party;
    v_capture_model TEXT;
    v_auth_fee NUMERIC;
    v_inbound NUMERIC;
    v_buyer_total NUMERIC;
    v_refund_amount NUMERIC;
    v_amount_hkd NUMERIC;
    v_auth_notes TEXT;
BEGIN
    IF p_order_kind = 'member' THEN
        SELECT
            mo.fault_party,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            mo.auth_notes
        INTO v_fault_party, v_capture_model, v_auth_fee, v_inbound, v_buyer_total, v_auth_notes
        FROM public.member_orders mo
        WHERE mo.id = p_order_id
          AND mo.use_authentication = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的會員鑑定訂單。';
        END IF;
    ELSIF p_order_kind = 'merchant' THEN
        SELECT
            mo.fault_party,
            mo.escrow_capture_model,
            COALESCE(mo.auth_fee, 0),
            COALESCE(mo.inbound_shipping_fee, 0),
            COALESCE(mo.buyer_total_amount, mo.total_amount, 0),
            mo.auth_notes
        INTO v_fault_party, v_capture_model, v_auth_fee, v_inbound, v_buyer_total, v_auth_notes
        FROM public.merchant_orders mo
        WHERE mo.id = p_order_id
          AND mo.requires_authentication = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION '找不到指定的商戶鑑定訂單。';
        END IF;
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    IF v_fault_party = 'seller'::public.grading_fault_party THEN
        NULL;
    ELSIF v_fault_party = 'carrier'::public.grading_fault_party
          AND COALESCE(v_auth_notes, '') ~ 'carrier_liability:\s*seller' THEN
        NULL;
    ELSE
        RETURN jsonb_build_object(
            'applies', false,
            'settlement_required', false
        );
    END IF;

    v_refund_amount := v_auth_fee + v_inbound;

    IF v_capture_model = 'single' THEN
        v_amount_hkd := v_buyer_total;
    ELSE
        v_amount_hkd := v_refund_amount;
    END IF;

    IF v_amount_hkd <= 0 THEN
        RAISE EXCEPTION '賣方追償金額異常。';
    END IF;

    RETURN jsonb_build_object(
        'applies', true,
        'settlement_required', true,
        'escrow_capture_model', v_capture_model,
        'amount_hkd', v_amount_hkd,
        'stripe_fee_hkd', 0,
        'refund_cents', CASE
            WHEN v_capture_model = 'single' THEN 0
            ELSE ROUND(v_refund_amount * 100)::INTEGER
        END,
        'refund_amount_hkd', v_refund_amount
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

        PERFORM set_config('grading.order_fail', 'on', true);

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
                WHEN fault_party = 'carrier'::public.grading_fault_party
                     AND COALESCE(auth_notes, '') ~ 'carrier_liability:\s*seller'
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status IN (
                      'authorized'::public.payment_capture_status,
                      'voided'::public.payment_capture_status
                  )
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            PERFORM set_config('grading.order_fail', 'off', true);
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        IF v_fault_party IS DISTINCT FROM 'buyer'::public.grading_fault_party THEN
            PERFORM public.fn_restore_member_order_coupon_on_void(p_order_id);
        END IF;

        PERFORM set_config('grading.order_fail', 'off', true);
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

        PERFORM set_config('grading.order_fail', 'on', true);

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
                WHEN fault_party = 'carrier'::public.grading_fault_party
                     AND COALESCE(auth_notes, '') ~ 'carrier_liability:\s*seller'
                    THEN 'pending'::public.seller_settlement_status
                ELSE seller_settlement_status
            END,
            updated_at = now()
        WHERE id = p_order_id
          AND refund_status = 'processing'
          AND (
              (
                  escrow_capture_model = 'single'
                  AND payment_capture_status IN (
                      'authorized'::public.payment_capture_status,
                      'voided'::public.payment_capture_status
                  )
              )
              OR (
                  escrow_capture_model IS DISTINCT FROM 'single'
                  AND payment_capture_status = 'auth_fee_captured'::public.payment_capture_status
              )
          )
        RETURNING * INTO v_updated;

        IF NOT FOUND THEN
            PERFORM set_config('grading.order_fail', 'off', true);
            RAISE EXCEPTION '鑑定失敗 finalize 失敗：訂單狀態不合法。';
        END IF;

        IF v_fault_party IS DISTINCT FROM 'buyer'::public.grading_fault_party THEN
            PERFORM public.fn_restore_merchant_order_coupon_on_void(p_order_id);
        END IF;

        PERFORM set_config('grading.order_fail', 'off', true);
    ELSE
        RAISE EXCEPTION '不支援的訂單類型。';
    END IF;

    UPDATE public.listings
    SET status = 'active'
    WHERE id = v_listing_id
      AND status = 'sold';

    v_liability := public.fn_compute_seller_grading_fail_liability(p_order_kind, p_order_id);

    IF COALESCE((v_liability->>'applies')::BOOLEAN, false) THEN
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
